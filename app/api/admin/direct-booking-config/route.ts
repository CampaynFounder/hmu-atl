// GET/PATCH /api/admin/direct-booking-config — admin-tunable settings for the direct booking flow.
// Stored under the config_key 'direct_booking.config' in platform_config.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';

export const runtime = 'nodejs';

const CONFIG_KEY = 'direct_booking.config';

const DEFAULTS = {
  expiry_minutes: 15,
};

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.hmuconfig.view')) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_key, config_value, updated_at
    FROM platform_config
    WHERE config_key = ${CONFIG_KEY}
    LIMIT 1
  `;

  const stored = (rows[0]?.config_value ?? {}) as Record<string, unknown>;
  const config = { ...DEFAULTS, ...stored };
  return NextResponse.json({ config, updatedAt: rows[0]?.updated_at ?? null });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.hmuconfig.edit')) return unauthorizedResponse();

  const body = await req.json().catch(() => ({})) as { expiry_minutes?: unknown };

  const expiryMinutes = Number(body.expiry_minutes);
  if (!Number.isInteger(expiryMinutes) || expiryMinutes < 1 || expiryMinutes > 60) {
    return NextResponse.json({ error: 'expiry_minutes must be an integer between 1 and 60' }, { status: 400 });
  }

  const newValue = { ...DEFAULTS, expiry_minutes: expiryMinutes };
  const jsonValue = JSON.stringify(newValue);

  const updated = await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${CONFIG_KEY}, ${jsonValue}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING config_key, config_value, updated_at
  `;

  invalidatePlatformConfig(CONFIG_KEY);
  await logAdminAction(admin.id, 'direct_booking_config_update', 'platform_config', CONFIG_KEY, { newValue });

  return NextResponse.json({ config: updated[0]?.config_value ?? newValue });
}
