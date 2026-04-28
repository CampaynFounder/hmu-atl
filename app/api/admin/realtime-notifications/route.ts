// GET/PATCH /api/admin/realtime-notifications — admin-tunable config for
// realtime banner notifications shown to super admins in the admin portal.
// Stored in platform_config under 'admin.realtime_notifications'.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, logAdminAction, unauthorizedResponse } from '@/lib/admin/helpers';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import {
  REALTIME_NOTIF_DEFAULTS,
  REALTIME_NOTIF_KEY,
  type AdminRealtimeNotifConfig,
} from '@/lib/admin/realtime-notifications';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT config_value, updated_at, updated_by
    FROM platform_config
    WHERE config_key = ${REALTIME_NOTIF_KEY}
    LIMIT 1
  ` as Array<{ config_value: Partial<AdminRealtimeNotifConfig>; updated_at: string; updated_by: string }>;

  return NextResponse.json({
    config: { ...REALTIME_NOTIF_DEFAULTS, ...(rows[0]?.config_value ?? {}) },
    defaults: REALTIME_NOTIF_DEFAULTS,
    updated_at: rows[0]?.updated_at ?? null,
    updated_by: rows[0]?.updated_by ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  // Only super admins can change which firehose events get banner-broadcast.
  if (!admin.is_super) return unauthorizedResponse();

  const body = await req.json().catch(() => null) as Partial<AdminRealtimeNotifConfig> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body must be an object' }, { status: 400 });
  }

  const next: AdminRealtimeNotifConfig = {
    user_signup: typeof body.user_signup === 'boolean' ? body.user_signup : REALTIME_NOTIF_DEFAULTS.user_signup,
    ride_request: typeof body.ride_request === 'boolean' ? body.ride_request : REALTIME_NOTIF_DEFAULTS.ride_request,
    ride_booking: typeof body.ride_booking === 'boolean' ? body.ride_booking : REALTIME_NOTIF_DEFAULTS.ride_booking,
  };

  const json = JSON.stringify(next);
  const updated = await sql`
    INSERT INTO platform_config (config_key, config_value, updated_by, updated_at)
    VALUES (${REALTIME_NOTIF_KEY}, ${json}::jsonb, ${admin.id}, NOW())
    ON CONFLICT (config_key) DO UPDATE SET
      config_value = EXCLUDED.config_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    RETURNING config_value, updated_at
  `;

  invalidatePlatformConfig(REALTIME_NOTIF_KEY);
  await logAdminAction(admin.id, 'realtime_notifications_update', 'platform_config', REALTIME_NOTIF_KEY, { newValue: next });

  return NextResponse.json({ config: next, updated_at: updated[0]?.updated_at });
}
