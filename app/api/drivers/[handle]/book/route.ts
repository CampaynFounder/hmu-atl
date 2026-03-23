import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import {
  checkRiderEligibility,
  createDirectBookingPost,
  getActiveDirectBooking,
} from '@/lib/db/direct-bookings';
import { notifyUser } from '@/lib/ably/server';
import { notifyDriverNewBooking } from '@/lib/sms/textbee';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { handle } = await params;

  let body: { price: number; areas?: string[]; timeWindow?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { price, timeWindow } = body;
  if (!price) {
    return NextResponse.json({ error: 'price is required' }, { status: 400 });
  }

  // Resolve IDs
  const [riderRows, driverRows] = await Promise.all([
    sql`SELECT id, account_status FROM users WHERE clerk_id = ${clerkId} LIMIT 1`,
    sql`SELECT user_id, areas, enforce_minimum, (pricing->>'minimum')::numeric as min_ride_price FROM driver_profiles WHERE handle = ${handle} LIMIT 1`,
  ]);

  if (!riderRows.length) return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
  if (!driverRows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

  const rider = riderRows[0] as { id: string; account_status: string };
  const driverProfile = driverRows[0] as { user_id: string; areas: string[]; enforce_minimum: boolean; min_ride_price: number | null };
  const driverUserId = driverProfile.user_id;

  // Enforce minimum price if driver has it enabled
  if (driverProfile.enforce_minimum !== false && driverProfile.min_ride_price && price < Number(driverProfile.min_ride_price)) {
    return NextResponse.json(
      { error: `dont hmu for less than $${Number(driverProfile.min_ride_price)}`, code: 'below_minimum', minimum: Number(driverProfile.min_ride_price) },
      { status: 400 }
    );
  }

  // Fall back to driver's areas if not provided
  const areas = body.areas?.length ? body.areas : (Array.isArray(driverProfile.areas) ? driverProfile.areas : ['ATL']);

  if (rider.account_status !== 'active') {
    return NextResponse.json({ error: 'Account not active' }, { status: 403 });
  }

  // Block if rider already has an active ride
  const activeRides = await sql`SELECT id FROM rides WHERE rider_id = ${rider.id} AND status IN ('matched','otw','here','active') LIMIT 1`;
  if (activeRides.length) {
    return NextResponse.json({ error: 'You already have an active ride', code: 'active_ride' }, { status: 409 });
  }

  // Check for an existing active booking to this driver
  const existing = await getActiveDirectBooking(rider.id, driverUserId);
  if (existing) {
    return NextResponse.json(
      { error: 'You already have an active booking request with this driver', postId: existing.id, expiresAt: existing.booking_expires_at },
      { status: 409 }
    );
  }

  // Re-run eligibility server-side (never trust client)
  const eligibility = await checkRiderEligibility(rider.id, driverUserId);
  if (!eligibility.eligible) {
    return NextResponse.json({ error: eligibility.reason, code: eligibility.code }, { status: 403 });
  }

  const post = await createDirectBookingPost({
    riderId: rider.id,
    driverUserId,
    price,
    areas,
    timeWindow: timeWindow || {},
  });

  // Fire Ably notification to driver
  try {
    await notifyUser(driverUserId, 'direct_booking_request', {
      postId: post.id, price, areas, expiresAt: post.booking_expires_at,
    });
  } catch (e) {
    console.error('Ably notify failed:', e);
  }

  // SMS notification to driver (non-blocking)
  try {
    const driverPhoneRows = await sql`
      SELECT phone FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
    `;
    const driverPhone = (driverPhoneRows[0] as Record<string, unknown>)?.phone as string;
    const riderNameRows = await sql`
      SELECT first_name FROM rider_profiles WHERE user_id = ${rider.id} LIMIT 1
    `;
    const riderName = (riderNameRows[0] as Record<string, unknown>)?.first_name as string || 'A rider';
    if (driverPhone) {
      notifyDriverNewBooking(driverPhone, riderName).catch(e => console.error('SMS failed:', e));
    }
  } catch (e) {
    console.error('SMS lookup failed:', e);
  }

  return NextResponse.json({ postId: post.id, expiresAt: post.booking_expires_at }, { status: 201 });
}
