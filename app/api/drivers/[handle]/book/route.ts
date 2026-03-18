import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import {
  checkRiderEligibility,
  createDirectBookingPost,
  getActiveDirectBooking,
} from '@/lib/db/direct-bookings';

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
    sql`SELECT user_id, areas FROM driver_profiles WHERE handle = ${handle} LIMIT 1`,
  ]);

  if (!riderRows.length) return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
  if (!driverRows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

  const rider = riderRows[0] as { id: string; account_status: string };
  const driverProfile = driverRows[0] as { user_id: string; areas: string[] };
  const driverUserId = driverProfile.user_id;

  // Fall back to driver's areas if not provided
  const areas = body.areas?.length ? body.areas : (Array.isArray(driverProfile.areas) ? driverProfile.areas : ['ATL']);

  if (rider.account_status !== 'active') {
    return NextResponse.json({ error: 'Account not active' }, { status: 403 });
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

  // TODO: Fire Ably notification to user:{driverUserId}:notify when Ably is wired
  // await ablyServer.channels.get(`user:${driverUserId}:notify`).publish('direct_booking_request', {
  //   postId: post.id, price, areas, expiresAt: post.booking_expires_at
  // });

  return NextResponse.json({ postId: post.id, expiresAt: post.booking_expires_at }, { status: 201 });
}
