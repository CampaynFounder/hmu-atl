// GET/PATCH /api/admin/hmu-config — admin-tunable platform_config rows with key LIKE 'hmu.%'.
// PATCH body: { config_key: string, config_value: object }  — writes one row, logs audit.
// Values are stored as jsonb; the admin UI chooses how to shape them (e.g. {value: N}, {mode: 'x'}).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.hmuconfig.view')) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_key, config_value, updated_at
    FROM platform_config
    WHERE config_key LIKE 'hmu.%'
    ORDER BY config_key
  `;
  return NextResponse.json({ rows });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.hmuconfig.edit')) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as { config_key?: string; config_value?: unknown };
  const key = body.config_key;
  const value = body.config_value;
  if (!key || !key.startsWith('hmu.')) {
    return NextResponse.json({ error: 'config_key must start with hmu.' }, { status: 400 });
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
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING config_key, config_value, updated_at
  `;

  await logAdminAction(admin.id, 'hmu_config_update', 'platform_config', key, { newValue: value });
  return NextResponse.json({ row: updated[0] });
}
