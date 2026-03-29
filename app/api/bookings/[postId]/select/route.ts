import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser, publishAdminEvent } from '@/lib/ably/server';
import { notifyRiderBookingAccepted } from '@/lib/sms/textbee';

/**
 * POST — Rider selects a driver from interested drivers.
 * Creates the ride record and notifies all parties.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { postId } = await params;
    const { driverUserId } = await req.json() as { driverUserId: string };

    if (!driverUserId) {
      return NextResponse.json({ error: 'driverUserId required' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const riderId = (userRows[0] as { id: string }).id;

    // Verify post belongs to this rider and is still active
    const postRows = await sql`
      SELECT * FROM hmu_posts
      WHERE id = ${postId} AND user_id = ${riderId} AND status = 'active' AND post_type = 'rider_request'
      LIMIT 1
    `;
    if (!postRows.length) {
      return NextResponse.json({ error: 'Request not found or already matched' }, { status: 404 });
    }
    const post = postRows[0] as Record<string, unknown>;
    const price = Number(post.price || 0);
    const timeWindow = (post.time_window || {}) as Record<string, unknown>;
    const areas = (post.areas || []) as string[];
    const isCash = (post.is_cash as boolean) || false;

    // Verify interest record exists
    const interestRows = await sql`
      SELECT id FROM ride_interests
      WHERE post_id = ${postId} AND driver_id = ${driverUserId} AND status = 'interested'
      LIMIT 1
    `;
    if (!interestRows.length) {
      return NextResponse.json({ error: 'Driver is no longer available' }, { status: 404 });
    }

    // Check neither party has an active ride
    const [riderActiveRides, driverActiveRides] = await Promise.all([
      sql`SELECT id FROM rides WHERE rider_id = ${riderId} AND status IN ('matched','otw','here','active') LIMIT 1`,
      sql`SELECT id FROM rides WHERE driver_id = ${driverUserId} AND status IN ('matched','otw','here','active') LIMIT 1`,
    ]);
    if (riderActiveRides.length) {
      return NextResponse.json({ error: 'You already have an active ride' }, { status: 409 });
    }
    if (driverActiveRides.length) {
      return NextResponse.json({ error: 'This driver is now on another ride' }, { status: 409 });
    }

    // Get driver info
    const driverRows = await sql`
      SELECT handle, display_name, wait_minutes FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
    `;
    const driverProfile = driverRows[0] as Record<string, unknown> | undefined;
    const driverName = (driverProfile?.handle as string) || (driverProfile?.display_name as string) || 'Driver';
    const waitMinutes = Number(driverProfile?.wait_minutes ?? 10);

    // Mark selected driver, expire others
    await sql`UPDATE ride_interests SET status = 'selected' WHERE post_id = ${postId} AND driver_id = ${driverUserId}`;
    await sql`UPDATE ride_interests SET status = 'passed' WHERE post_id = ${postId} AND driver_id != ${driverUserId} AND status = 'interested'`;

    // Update post to matched
    await sql`UPDATE hmu_posts SET status = 'matched' WHERE id = ${postId}`;

    // Expire other active posts for this rider
    await sql`
      UPDATE hmu_posts SET status = 'expired'
      WHERE user_id = ${riderId} AND id != ${postId} AND status = 'active'
        AND post_type IN ('rider_request', 'direct_booking')
    `;

    // Create ride
    const rideRows = await sql`
      INSERT INTO rides (
        driver_id, rider_id, status, amount, final_agreed_price,
        price_mode, price_accepted_at,
        hmu_post_id, agreement_summary,
        dispute_window_minutes, is_cash, wait_minutes
      ) VALUES (
        ${driverUserId}, ${riderId}, 'matched', ${price}, ${price},
        'proposed', NOW(),
        ${postId}, ${JSON.stringify({
          destination: timeWindow.destination || timeWindow.note || '',
          time: timeWindow.time || 'ASAP',
          stops: timeWindow.stops || 'none',
          roundTrip: timeWindow.round_trip === true,
          areas,
          price,
        })}::jsonb,
        ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '5')},
        ${isCash},
        ${waitMinutes}
      )
      RETURNING id
    `;
    const rideId = (rideRows[0] as { id: string }).id;

    // Notify selected driver
    await notifyUser(driverUserId, 'booking_accepted', {
      rideId, postId, riderId, price,
      message: 'You were selected for this ride!',
    }).catch(() => {});

    // Notify rider
    await notifyUser(riderId, 'booking_accepted', {
      rideId, postId, driverUserId, driverName, price,
      message: `Matched with ${driverName}!`,
    }).catch(() => {});

    await publishRideUpdate(rideId, 'status_change', {
      status: 'matched',
      message: 'Ride matched — driver will be OTW soon',
    }).catch(() => {});

    publishAdminEvent('ride_created', { rideId, driverUserId, riderId, price, status: 'matched' }).catch(() => {});

    // Notify passed drivers
    const passedDrivers = await sql`
      SELECT driver_id FROM ride_interests WHERE post_id = ${postId} AND status = 'passed'
    `;
    for (const row of passedDrivers) {
      const passedId = (row as { driver_id: string }).driver_id;
      notifyUser(passedId, 'interest_passed', {
        postId,
        message: 'Rider chose another driver for this ride',
      }).catch(() => {});
    }

    // SMS rider
    try {
      const riderPhoneRows = await sql`SELECT phone FROM rider_profiles WHERE user_id = ${riderId} LIMIT 1`;
      const riderPhone = (riderPhoneRows[0] as Record<string, unknown>)?.phone as string;
      if (riderPhone) {
        notifyRiderBookingAccepted(riderPhone, driverName, rideId).catch(() => {});
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({ status: 'matched', rideId });
  } catch (error) {
    console.error('Select driver error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/**
 * GET — Rider fetches interested drivers for their post.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { postId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const riderId = (userRows[0] as { id: string }).id;

    // Verify post belongs to rider
    const postRows = await sql`SELECT id FROM hmu_posts WHERE id = ${postId} AND user_id = ${riderId} LIMIT 1`;
    if (!postRows.length) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const rows = await sql`
      SELECT
        ri.id as interest_id,
        ri.driver_id,
        ri.price_offered,
        ri.created_at,
        dp.handle,
        dp.display_name,
        dp.avatar_url,
        dp.video_url,
        dp.areas,
        dp.pricing,
        dp.lgbtq_friendly,
        dp.fwu,
        u.chill_score,
        u.completed_rides,
        u.tier
      FROM ride_interests ri
      JOIN driver_profiles dp ON dp.user_id = ri.driver_id
      JOIN users u ON u.id = ri.driver_id
      WHERE ri.post_id = ${postId} AND ri.status = 'interested'
      ORDER BY ri.created_at ASC
    `;

    const drivers = rows.map((r: Record<string, unknown>) => ({
      interestId: r.interest_id,
      driverUserId: r.driver_id,
      handle: r.handle,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      videoUrl: r.video_url,
      areas: r.areas,
      pricing: r.pricing,
      lgbtqFriendly: r.lgbtq_friendly,
      fwu: r.fwu,
      chillScore: Number(r.chill_score || 0),
      completedRides: Number(r.completed_rides || 0),
      tier: r.tier,
      priceOffered: Number(r.price_offered || 0),
      interestedAt: r.created_at,
    }));

    return NextResponse.json({ drivers, count: drivers.length });
  } catch (error) {
    console.error('Get interested drivers error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
