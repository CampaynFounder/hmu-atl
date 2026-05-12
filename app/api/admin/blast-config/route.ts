// GET/PATCH /api/admin/blast-config — admin-tunable blast booking config rows.
// Surfaces `blast_matching_v1` (the matching algorithm JSON) and all `blast.*`
// knobs (sms kill switch, rate limits, draft TTL).
//
// PATCH body: { config_key: string, config_value: object }
// Mirrors the hmu-config pattern.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const ALLOWED_KEYS_PREFIX = 'blast.';
const ALLOWED_EXACT_KEYS = new Set(['blast_matching_v1']);

function isAllowedKey(key: string): boolean {
  return key.startsWith(ALLOWED_KEYS_PREFIX) || ALLOWED_EXACT_KEYS.has(key);
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.blastconfig.view')) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_key, config_value, updated_at
    FROM platform_config
    WHERE config_key = 'blast_matching_v1' OR config_key LIKE 'blast.%'
    ORDER BY
      CASE WHEN config_key = 'blast_matching_v1' THEN 0 ELSE 1 END,
      config_key
  `;
  return NextResponse.json({ rows });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.blastconfig.edit')) return unauthorizedResponse();

  const body = (await req.json().catch(() => ({}))) as {
    config_key?: string;
    config_value?: unknown;
  };
  const key = body.config_key;
  const value = body.config_value;

  if (!key || !isAllowedKey(key)) {
    return NextResponse.json(
      { error: "config_key must be 'blast_matching_v1' or start with 'blast.'" },
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
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING config_key, config_value, updated_at
  `;

  invalidatePlatformConfig(key);
  await logAdminAction(admin.id, 'blast_config_update', 'platform_config', key, { newValue: value });
  return NextResponse.json({ row: updated[0] });
}
