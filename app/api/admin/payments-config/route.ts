// GET/PATCH /api/admin/payments-config
// Surfaces payments:global and per-market payments:global:market:{slug} rows.
// PATCH body: { config_key: string, config_value: object }

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const ALLOWED_EXACT_KEYS = new Set(['payments:global']);
const MARKET_OVERRIDE_PATTERN = /^payments:global:market:[a-z0-9-]{2,32}$/;

function isAllowedKey(key: string): boolean {
  return ALLOWED_EXACT_KEYS.has(key) || MARKET_OVERRIDE_PATTERN.test(key);
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.payments.view') && !admin.is_super) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_key, config_value, updated_at
    FROM platform_config
    WHERE config_key = 'payments:global'
       OR config_key LIKE 'payments:global:market:%'
    ORDER BY
      CASE WHEN config_key = 'payments:global' THEN 0 ELSE 1 END,
      config_key
  `;
  return NextResponse.json({ rows });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.payments.edit') && !admin.is_super) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    config_key?: string;
    config_value?: unknown;
  };
  const key = body.config_key;
  const value = body.config_value;

  if (!key || !isAllowedKey(key)) {
    return NextResponse.json(
      { error: "config_key must be 'payments:global' or 'payments:global:market:{slug}'" },
      { status: 400 },
    );
  }
  if (!value || typeof value !== 'object') {
    return NextResponse.json({ error: 'config_value must be a JSON object' }, { status: 400 });
  }

  const jsonValue = JSON.stringify(value);
  const updated = await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${key}, ${jsonValue}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING config_key, config_value, updated_at
  `;

  invalidatePlatformConfig(key);
  await logAdminAction(admin.id, 'payments_config_update', 'platform_config', key, { newValue: value });
  return NextResponse.json({ row: updated[0] });
}
