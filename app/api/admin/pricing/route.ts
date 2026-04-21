import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// GET — fetch pricing configs for a market (falls back to global rows where
// market_id IS NULL). When no marketId is provided, return everything so the
// admin can see history across markets.
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');

  const configs = await sql`
    SELECT
      id, tier, fee_rate, daily_cap, weekly_cap, progressive_thresholds,
      peak_multiplier, peak_label, effective_from, effective_to,
      change_reason, changed_by, is_active, created_at, market_id
    FROM pricing_config
    WHERE ${marketId}::uuid IS NULL OR market_id = ${marketId} OR market_id IS NULL
    ORDER BY is_active DESC, effective_from DESC
  `;

  return NextResponse.json({
    configs: configs.map((c: Record<string, unknown>) => ({
      id: c.id,
      tier: c.tier,
      feeRate: Number(c.fee_rate),
      dailyCap: Number(c.daily_cap),
      weeklyCap: Number(c.weekly_cap),
      progressiveThresholds: c.progressive_thresholds,
      peakMultiplier: Number(c.peak_multiplier ?? 1),
      peakLabel: c.peak_label,
      effectiveFrom: c.effective_from,
      effectiveTo: c.effective_to,
      changeReason: c.change_reason,
      isActive: c.is_active,
      marketId: c.market_id ?? null,
      createdAt: c.created_at,
    })),
  });
}

// POST — create a new pricing config (deactivates the current one for that tier)
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const {
    tier, feeRate, dailyCap, weeklyCap, progressiveThresholds,
    peakMultiplier, peakLabel, effectiveFrom, effectiveTo, changeReason,
    marketId,
  } = await req.json() as {
    tier: string;
    feeRate: number;
    dailyCap: number;
    weeklyCap: number;
    progressiveThresholds?: unknown[];
    peakMultiplier?: number;
    peakLabel?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    changeReason?: string;
    marketId?: string | null;
  };

  if (!tier || !['free', 'hmu_first'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }
  if (feeRate < 0 || feeRate > 1) {
    return NextResponse.json({ error: 'Fee rate must be between 0 and 1' }, { status: 400 });
  }

  // Deactivate current active config for this tier+market (or global slot if
  // marketId is null). A market's pricing is independent of other markets.
  await sql`
    UPDATE pricing_config SET is_active = false
    WHERE tier = ${tier} AND is_active = true
      AND ((${marketId ?? null}::uuid IS NULL AND market_id IS NULL)
           OR market_id = ${marketId ?? null})
  `;

  // Create new config
  const result = await sql`
    INSERT INTO pricing_config (
      tier, market_id, fee_rate, daily_cap, weekly_cap, progressive_thresholds,
      peak_multiplier, peak_label, effective_from, effective_to,
      change_reason, changed_by, is_active
    ) VALUES (
      ${tier}, ${marketId ?? null}, ${feeRate}, ${dailyCap}, ${weeklyCap},
      ${progressiveThresholds ? JSON.stringify(progressiveThresholds) : null}::jsonb,
      ${peakMultiplier ?? 1}, ${peakLabel ?? null},
      ${effectiveFrom ?? new Date().toISOString().split('T')[0]},
      ${effectiveTo ?? null},
      ${changeReason ?? null}, ${admin.id}, true
    )
    RETURNING id
  `;

  return NextResponse.json({ id: (result[0] as { id: string }).id, status: 'created' });
}
