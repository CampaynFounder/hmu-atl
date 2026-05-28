// GET/PATCH /api/admin/variable-costs
// Super-admin only. Stores and retrieves monthly variable infrastructure costs
// used to compute break-even rides/day and margin in the mobile admin dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/helpers';
import { getPlatformConfig } from '@/lib/platform-config/get';
import { sql } from '@/lib/db/client';

const CONFIG_KEY = 'admin.variable_costs';

interface VariableCosts {
  cloudflare: number;
  stripe: number;
  clerk: number;
  neon: number;
}

const DEFAULTS: VariableCosts = { cloudflare: 0, stripe: 0, clerk: 0, neon: 0 };

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin?.is_super) return unauthorized();

  const raw = await getPlatformConfig(CONFIG_KEY, DEFAULTS as unknown as Record<string, unknown>);
  const monthly = raw as unknown as VariableCosts;
  const totalMonthly = (monthly.cloudflare ?? 0) + (monthly.stripe ?? 0) + (monthly.clerk ?? 0) + (monthly.neon ?? 0);

  return NextResponse.json({ costs: monthly, totalMonthly, dailyCost: Number((totalMonthly / 30).toFixed(2)) });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin?.is_super) return unauthorized();

  const body = await req.json().catch(() => ({})) as Partial<VariableCosts>;
  const rawCurrent = await getPlatformConfig(CONFIG_KEY, DEFAULTS as unknown as Record<string, unknown>);
  const current = rawCurrent as unknown as VariableCosts;
  const updated: VariableCosts = {
    cloudflare: Number(body.cloudflare ?? current.cloudflare ?? 0),
    stripe:     Number(body.stripe     ?? current.stripe     ?? 0),
    clerk:      Number(body.clerk      ?? current.clerk      ?? 0),
    neon:       Number(body.neon       ?? current.neon       ?? 0),
  };

  await sql`
    INSERT INTO platform_config (config_key, config_value)
    VALUES (${CONFIG_KEY}, ${JSON.stringify(updated)}::jsonb)
    ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value
  `;

  const totalMonthly = updated.cloudflare + updated.stripe + updated.clerk + updated.neon;
  return NextResponse.json({ costs: updated, totalMonthly, dailyCost: Number((totalMonthly / 30).toFixed(2)) });
}
