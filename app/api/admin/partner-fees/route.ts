// GET/PATCH /api/admin/partner-fees
// Manages the partner delivery-fee policy in platform_config:
//   partner_fees.config            → global default
//   partner_fees:market:{slug}     → per-market override
// PATCH body: { config_key, config_value: FeePolicy }

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const GLOBAL_KEY = 'partner_fees.config';
// Per-market override keys: partner_fees:market:{slug}, slug lowercase
// alphanumeric/dash, 2–32 chars (same shape as the blast-config validator).
const MARKET_OVERRIDE_PATTERN = /^partner_fees:market:[a-z0-9-]{2,32}$/;

function isAllowedKey(key: string): boolean {
  return key === GLOBAL_KEY || MARKET_OVERRIDE_PATTERN.test(key);
}

const VALID_MODES = new Set(['percent', 'flat', 'none']);

function validatePolicy(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'config_value must be a JSON object';
  const v = value as Record<string, unknown>;
  if (typeof v.commission_mode !== 'string' || !VALID_MODES.has(v.commission_mode)) {
    return 'commission_mode must be percent, flat, or none';
  }
  const nums = ['commission_bps', 'commission_flat_cents', 'min_commission_cents'];
  for (const k of nums) {
    if (typeof v[k] !== 'number' || !Number.isFinite(v[k] as number) || (v[k] as number) < 0) {
      return `${k} must be a non-negative number`;
    }
  }
  if (typeof v.tip_takes_commission !== 'boolean') return 'tip_takes_commission must be a boolean';
  if (typeof v.absorb_stripe_fee !== 'boolean') return 'absorb_stripe_fee must be a boolean';
  if ((v.commission_bps as number) > 10000) return 'commission_bps cannot exceed 10000 (100%)';
  return null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.partnerfees')) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_key, config_value, updated_at
    FROM platform_config
    WHERE config_key = 'partner_fees.config'
       OR config_key LIKE 'partner_fees:market:%'
    ORDER BY config_key
  `;
  return NextResponse.json({ rows });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.partnerfees')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    config_key?: string;
    config_value?: unknown;
  };
  const key = body.config_key;
  const value = body.config_value;

  if (!key || !isAllowedKey(key)) {
    return NextResponse.json(
      { error: "config_key must be 'partner_fees.config' or 'partner_fees:market:{slug}'" },
      { status: 400 },
    );
  }
  const invalid = validatePolicy(value);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const jsonValue = JSON.stringify(value);
  const updated = await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${key}, ${jsonValue}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by   = EXCLUDED.updated_by,
      updated_at   = NOW()
    RETURNING config_key, config_value, updated_at
  `;

  invalidatePlatformConfig(key);
  await logAdminAction(admin.id, 'partner_fees_update', 'platform_config', key, { newValue: value });
  return NextResponse.json({ row: updated[0] });
}

// DELETE /api/admin/partner-fees?key=partner_fees:market:{slug}
// Removes a per-market override so that market falls back to the global policy.
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.partnerfees')) return unauthorizedResponse();

  const key = req.nextUrl.searchParams.get('key') ?? '';
  if (!MARKET_OVERRIDE_PATTERN.test(key)) {
    return NextResponse.json({ error: 'Only per-market override keys can be deleted' }, { status: 400 });
  }
  await sql`DELETE FROM platform_config WHERE config_key = ${key}`;
  invalidatePlatformConfig(key);
  await logAdminAction(admin.id, 'partner_fees_delete', 'platform_config', key, {});
  return NextResponse.json({ ok: true });
}
