// GET/PATCH /api/admin/down-bad-config
// Manages `down_bad.config` and `down_bad.disclaimer` rows in platform_config.
// PATCH body: { config_key: 'down_bad.config' | 'down_bad.disclaimer', config_value: object }

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const ALLOWED_KEYS = new Set(['down_bad.config', 'down_bad.disclaimer']);

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.downbad')) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_key, config_value, updated_at
    FROM platform_config
    WHERE config_key LIKE 'down_bad.%'
    ORDER BY config_key
  `;
  return NextResponse.json({ rows });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.downbad')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    config_key?: string;
    config_value?: unknown;
  };
  const key = body.config_key;
  const value = body.config_value;

  if (!key || !ALLOWED_KEYS.has(key)) {
    return NextResponse.json(
      { error: "config_key must be 'down_bad.config' or 'down_bad.disclaimer'" },
      { status: 400 },
    );
  }
  if (value === undefined || value === null || typeof value !== 'object') {
    return NextResponse.json({ error: 'config_value must be a JSON object' }, { status: 400 });
  }

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
  await logAdminAction(admin.id, 'down_bad_config_update', 'platform_config', key, { newValue: value });
  return NextResponse.json({ row: updated[0] });
}
