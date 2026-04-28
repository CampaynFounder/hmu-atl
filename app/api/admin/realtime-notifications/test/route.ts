// POST /api/admin/realtime-notifications/test — emit a synthetic admin:feed
// event so the super admin can verify their banner setup without waiting
// for real activity. Body: { type: 'user_signup' | 'ride_request' | 'ride_booking' }
//
// The Ably event name is the same one a real publisher would use, so the
// banner component's normal listener path is exercised end-to-end.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { publishAdminEvent } from '@/lib/ably/server';
import type { AdminRealtimeNotifType } from '@/lib/admin/realtime-notifications';

export const runtime = 'nodejs';

// _force: true tells the banner to render the test even if the type is
// currently disabled in config. Real publishers never set _force, so live
// traffic still respects the toggles.
const TEST_PAYLOADS: Record<AdminRealtimeNotifType, { eventName: string; data: Record<string, unknown> }> = {
  user_signup: {
    eventName: 'user_signup',
    data: { _force: true, profileType: 'driver', userId: 'test-user' },
  },
  ride_request: {
    eventName: 'rider_request',
    data: { _force: true, postId: 'test-post', price: 25, message: 'Buckhead → Decatur' },
  },
  ride_booking: {
    eventName: 'direct_booking_created',
    data: { _force: true, postId: 'test-post', price: 30, driverHandle: 'test-driver' },
  },
};

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = await req.json().catch(() => null) as { type?: string } | null;
  const type = body?.type as AdminRealtimeNotifType | undefined;
  if (!type || !(type in TEST_PAYLOADS)) {
    return NextResponse.json({ error: 'type must be one of: user_signup, ride_request, ride_booking' }, { status: 400 });
  }

  const { eventName, data } = TEST_PAYLOADS[type];
  await publishAdminEvent(eventName, data);
  return NextResponse.json({ ok: true, eventName, data });
}
