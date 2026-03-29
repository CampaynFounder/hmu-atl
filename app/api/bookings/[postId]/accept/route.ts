import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser, publishAdminEvent } from '@/lib/ably/server';
import { notifyRiderBookingAccepted } from '@/lib/sms/textbee';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { postId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const driverUserId = (userRows[0] as { id: string }).id;

    // Payout setup check — warn but don't block (payments not live yet)
    // TODO: Re-enable when payment flow is live
    // const payoutRows = await sql`
    //   SELECT payout_setup_complete FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
    // `;
    // if (payoutRows.length && !(payoutRows[0] as Record<string, unknown>).payout_setup_complete) {
    //   return NextResponse.json({ error: 'PAYOUT_REQUIRED' }, { status: 403 });
    // }

    const postRows = await sql`
      SELECT * FROM hmu_posts
      WHERE id = ${postId}
        AND status = 'active'
        AND (
          (post_type = 'direct_booking' AND target_driver_id = ${driverUserId} AND booking_expires_at > NOW())
          OR
          (post_type = 'rider_request' AND expires_at > NOW())
        )
      LIMIT 1
    `;

    if (!postRows.length) {
      return NextResponse.json({ error: 'Request not found or expired' }, { status: 404 });
    }

    const post = postRows[0] as Record<string, unknown>;
    const riderId = post.user_id as string;
    const price = Number(post.price || 0);
    const timeWindow = (post.time_window || {}) as Record<string, unknown>;
    const areas = (post.areas || []) as string[];
    const isCash = (post.is_cash as boolean) || false;

    // ── Cash ride counter check ──
    if (isCash) {
      const cashRows = await sql`
        SELECT dp.cash_rides_remaining, dp.cash_pack_balance, dp.cash_rides_reset_at, u.tier
        FROM users u
        JOIN driver_profiles dp ON dp.user_id = u.id
        WHERE u.id = ${driverUserId} LIMIT 1
      `;
      const cashInfo = cashRows[0] as { cash_rides_remaining: number; cash_pack_balance: number; cash_rides_reset_at: string; tier: string } | undefined;

      if (cashInfo && cashInfo.tier !== 'hmu_first') {
        // Monthly reset check
        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        let freeRemaining = cashInfo.cash_rides_remaining;

        if (cashInfo.cash_rides_reset_at && new Date(cashInfo.cash_rides_reset_at) < firstOfMonth) {
          freeRemaining = 3; // Would be reset
        }

        const totalAvailable = freeRemaining + cashInfo.cash_pack_balance;
        if (totalAvailable <= 0) {
          return NextResponse.json({
            error: 'No cash rides remaining. Purchase a Cash Pack or upgrade to HMU First for unlimited.',
            code: 'no_cash_rides',
          }, { status: 403 });
        }
      }
    }

    // ── Single-ride invariant: check BOTH rider and driver ──
    const [riderActiveRides, driverActiveRides] = await Promise.all([
      sql`SELECT id FROM rides WHERE rider_id = ${riderId} AND status IN ('matched','otw','here','active') LIMIT 1`,
      sql`SELECT id FROM rides WHERE driver_id = ${driverUserId} AND status IN ('matched','otw','here','active') LIMIT 1`,
    ]);

    if (riderActiveRides.length) {
      return NextResponse.json({ error: 'This rider already has an active ride' }, { status: 409 });
    }
    if (driverActiveRides.length) {
      return NextResponse.json({ error: 'You already have an active ride' }, { status: 409 });
    }

    // Get driver's wait time setting
    const waitRows = await sql`SELECT wait_minutes FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1`;
    const waitMinutes = Number((waitRows[0] as Record<string, unknown>)?.wait_minutes ?? 10);

    // Update this post to matched
    await sql`UPDATE hmu_posts SET status = 'matched' WHERE id = ${postId}`;

    // Cascade: expire all OTHER active posts for this rider (first-accept-wins)
    await sql`
      UPDATE hmu_posts SET status = 'expired'
      WHERE user_id = ${riderId}
        AND id != ${postId}
        AND status = 'active'
        AND post_type IN ('rider_request', 'direct_booking')
    `;

    // Create ride record
    const rideRows = await sql`
      INSERT INTO rides (
        driver_id, rider_id, status, amount, final_agreed_price,
        price_mode, proposed_price, price_accepted_at,
        hmu_post_id, agreement_summary,
        dispute_window_minutes, is_cash, wait_minutes
      ) VALUES (
        ${driverUserId}, ${riderId}, 'matched', ${price}, ${price},
        'proposed', ${price}, NOW(),
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

    // Get driver display name for notification
    const driverNameRows = await sql`
      SELECT handle, display_name FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
    `;
    const driverName = (driverNameRows[0] as Record<string, unknown>)?.handle as string || (driverNameRows[0] as Record<string, unknown>)?.display_name as string || 'A driver';

    // Notify rider via Ably
    await notifyUser(riderId, 'booking_accepted', {
      rideId,
      postId,
      driverUserId,
      driverName,
      price,
      message: `${driverName} accepted your ride!`,
    }).catch(() => {});

    await publishRideUpdate(rideId, 'status_change', {
      status: 'matched',
      message: 'Ride matched — driver will be OTW soon',
    }).catch(() => {});

    publishAdminEvent('ride_created', { rideId, driverUserId, riderId, price, status: 'matched' }).catch(() => {});

    // SMS rider that their booking was accepted
    try {
      const riderPhoneRows = await sql`SELECT phone FROM rider_profiles WHERE user_id = ${riderId} LIMIT 1`;
      const riderPhone = (riderPhoneRows[0] as Record<string, unknown>)?.phone as string;
      if (riderPhone) {
        notifyRiderBookingAccepted(riderPhone, driverName, rideId).catch(() => {});
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({ status: 'matched', rideId });
  } catch (error) {
    console.error('Accept booking error:', error);
    console.error('Accept error stack:', error instanceof Error ? error.stack : 'no stack');
    const msg = error instanceof Error ? error.message : 'Failed to accept';
    return NextResponse.json(
      { error: msg, detail: String(error) },
      { status: 500 }
    );
  }
}
