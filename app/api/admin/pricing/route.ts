import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// GET — fetch all pricing configs (active + history)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const configs = await sql`
    SELECT
      id, tier, fee_rate, daily_cap, weekly_cap, progressive_thresholds,
      peak_multiplier, peak_label, effective_from, effective_to,
      change_reason, changed_by, is_active, created_at
    FROM pricing_config
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
  };

  if (!tier || !['free', 'hmu_first'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }
  if (feeRate < 0 || feeRate > 1) {
    return NextResponse.json({ error: 'Fee rate must be between 0 and 1' }, { status: 400 });
  }

  // Deactivate current active config for this tier
  await sql`
    UPDATE pricing_config SET is_active = false
    WHERE tier = ${tier} AND is_active = true
  `;

  // Create new config
  const result = await sql`
    INSERT INTO pricing_config (
      tier, fee_rate, daily_cap, weekly_cap, progressive_thresholds,
      peak_multiplier, peak_label, effective_from, effective_to,
      change_reason, changed_by, is_active
    ) VALUES (
      ${tier}, ${feeRate}, ${dailyCap}, ${weeklyCap},
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
