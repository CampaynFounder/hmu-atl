import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// GET — fetch all hold policies (active + history)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT
      id, tier, hold_mode, hold_percent, hold_fixed, hold_minimum,
      cancel_before_otw_refund_pct, cancel_after_otw_driver_pct, cancel_after_otw_platform_pct,
      no_show_platform_tiers,
      effective_from, effective_to, change_reason, changed_by, is_active, created_at
    FROM hold_policy
    ORDER BY is_active DESC, effective_from DESC
  `;

  return NextResponse.json({
    policies: rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      tier: r.tier,
      holdMode: r.hold_mode,
      holdPercent: r.hold_percent != null ? Number(r.hold_percent) : null,
      holdFixed: r.hold_fixed != null ? Number(r.hold_fixed) : null,
      holdMinimum: Number(r.hold_minimum ?? 5),
      cancelBeforeOtwRefundPct: Number(r.cancel_before_otw_refund_pct ?? 1),
      cancelAfterOtwDriverPct: Number(r.cancel_after_otw_driver_pct ?? 1),
      cancelAfterOtwPlatformPct: Number(r.cancel_after_otw_platform_pct ?? 0),
      noShowPlatformTiers: r.no_show_platform_tiers || [],
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      changeReason: r.change_reason,
      isActive: r.is_active,
      createdAt: r.created_at,
    })),
  });
}

// POST — create a new hold policy (deactivates previous for that tier)
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await req.json() as {
    tier: string;
    holdMode: string;
    holdPercent?: number | null;
    holdFixed?: number | null;
    holdMinimum?: number;
    cancelBeforeOtwRefundPct?: number;
    cancelAfterOtwDriverPct?: number;
    cancelAfterOtwPlatformPct?: number;
    noShowPlatformTiers?: unknown[];
    effectiveFrom?: string;
    effectiveTo?: string;
    changeReason?: string;
  };

  if (!body.tier || !['free', 'hmu_first'].includes(body.tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
  }
  if (!body.holdMode || !['full', 'deposit_percent', 'deposit_fixed'].includes(body.holdMode)) {
    return NextResponse.json({ error: 'Invalid hold mode' }, { status: 400 });
  }
  if (body.holdMode === 'deposit_percent' && (body.holdPercent == null || body.holdPercent <= 0 || body.holdPercent > 1)) {
    return NextResponse.json({ error: 'Hold percent must be between 0 and 1' }, { status: 400 });
  }
  if (body.holdMode === 'deposit_fixed' && (body.holdFixed == null || body.holdFixed <= 0)) {
    return NextResponse.json({ error: 'Hold fixed amount must be greater than 0' }, { status: 400 });
  }

  // Validate no-show tiers if provided
  if (body.noShowPlatformTiers?.length) {
    for (const t of body.noShowPlatformTiers as { up_to?: number; above?: number; rate?: number }[]) {
      if (t.rate == null || t.rate < 0 || t.rate > 1) {
        return NextResponse.json({ error: 'No-show tier rates must be between 0 and 1' }, { status: 400 });
      }
    }
  }

  // Deactivate current active policy for this tier
  await sql`
    UPDATE hold_policy SET is_active = false
    WHERE tier = ${body.tier} AND is_active = true
  `;

  const result = await sql`
    INSERT INTO hold_policy (
      tier, hold_mode, hold_percent, hold_fixed, hold_minimum,
      cancel_before_otw_refund_pct, cancel_after_otw_driver_pct, cancel_after_otw_platform_pct,
      no_show_platform_tiers,
      effective_from, effective_to, change_reason, changed_by, is_active
    ) VALUES (
      ${body.tier},
      ${body.holdMode},
      ${body.holdPercent ?? null},
      ${body.holdFixed ?? null},
      ${body.holdMinimum ?? 5},
      ${body.cancelBeforeOtwRefundPct ?? 1},
      ${body.cancelAfterOtwDriverPct ?? 1},
      ${body.cancelAfterOtwPlatformPct ?? 0},
      ${body.noShowPlatformTiers ? JSON.stringify(body.noShowPlatformTiers) : '[]'}::jsonb,
      ${body.effectiveFrom ?? new Date().toISOString().split('T')[0]},
      ${body.effectiveTo ?? null},
      ${body.changeReason ?? null},
      ${admin.id},
      true
    )
    RETURNING id
  `;

  return NextResponse.json({ id: (result[0] as { id: string }).id, status: 'created' });
}
