// PATCH a single driver's chat-booking override.
// Body: { override: true | false | null }
//   null  → remove the override (driver inherits from global)
//   true  → force chat ON for this driver regardless of global
//   false → force chat OFF for this driver regardless of global

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, hasPermission, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { invalidatePlatformConfig } from '@/lib/platform-config/get';
import { getChatBookingConfig } from '@/lib/chat/config';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.chatbooking.edit')) return unauthorizedResponse();

  const { driverId } = await params;
  const body = (await req.json().catch(() => null)) as { override?: boolean | null } | null;
  if (!body) return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  const cfg = await getChatBookingConfig();
  const overrides = { ...(cfg.driver_overrides ?? {}) };

  if (body.override === true)       overrides[driverId] = true;
  else if (body.override === false) overrides[driverId] = false;
  else if (body.override === null)  delete overrides[driverId];
  else return NextResponse.json({ error: 'override must be true|false|null' }, { status: 400 });

  const next = { ...cfg, driver_overrides: overrides };

  await sql`
    UPDATE platform_config SET
      config_value = ${JSON.stringify(next)}::jsonb,
      updated_by = ${admin.clerk_id},
      updated_at = NOW()
    WHERE config_key = 'chat_booking'
  `;
  invalidatePlatformConfig('chat_booking');

  await logAdminAction(admin.id, 'chat_booking_driver_override', 'driver', driverId, {
    override: body.override,
  });

  return NextResponse.json({
    ok: true,
    override: body.override,
    effective: typeof body.override === 'boolean' ? body.override : cfg.enabled,
  });
}
