import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser, publishAdminEvent } from '@/lib/ably/server';
import { notifyRiderBookingAccepted } from '@/lib/sms/textbee';
import {
  checkDriverAvailability,
  confirmTentativeBooking,
  createRideBooking,
  resolveBookingWindow,
} from '@/lib/schedule/conflicts';
import { parseNaturalTime } from '@/lib/schedule/parse-time';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { generateRefCode } from '@/lib/rides/ref-code';

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

    // Get driver display name
    const driverNameRows = await sql`
      SELECT handle, display_name, video_url FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
    `;
    const driverProfile = driverNameRows[0] as Record<string, unknown> | undefined;
    const driverName = (driverProfile?.handle as string) || (driverProfile?.display_name as string) || 'A driver';

    const isDirectBooking = post.post_type === 'direct_booking';

    // ── OPEN REQUESTS: Register interest (rider picks later) ──
    if (!isDirectBooking) {
      // Check driver doesn't already have interest or active ride
      const [existingInterest, driverActiveRides] = await Promise.all([
        sql`SELECT id FROM ride_interests WHERE post_id = ${postId} AND driver_id = ${driverUserId} LIMIT 1`,
        sql`SELECT id FROM rides WHERE driver_id = ${driverUserId} AND status IN ('otw','here','active') LIMIT 1`,
      ]);

      if (existingInterest.length) {
        return NextResponse.json({ error: 'You already expressed interest in this ride' }, { status: 409 });
      }
      if (driverActiveRides.length) {
        return NextResponse.json({ error: 'You already have an active ride' }, { status: 409 });
      }

      // Check schedule conflicts — same window helper as every other route.
      // Strict for non-cash (held card), loose for cash.
      const window = resolveBookingWindow(timeWindow || {});
      const availability = await checkDriverAvailability(
        driverUserId,
        window.startAt,
        window.endAt,
        { strict: !isCash }
      );
      // Allow if the only conflict is a tentative hold (may be this driver's own)
      if (!availability.available && availability.conflict) {
        const conflictDetails = availability.conflict as Record<string, unknown>;
        const isSelfHold = conflictDetails.bookingType === 'hold';
        if (!isSelfHold) {
          return NextResponse.json({
            error: 'You have a booking conflict at this time',
            code: 'schedule_conflict',
          }, { status: 409 });
        }
      }

      await sql`
        INSERT INTO ride_interests (post_id, driver_id, price_offered, status)
        VALUES (${postId}, ${driverUserId}, ${price}, 'interested')
        ON CONFLICT (post_id, driver_id) DO NOTHING
      `;

      // Notify rider that a driver is interested
      await notifyUser(riderId, 'driver_interested', {
        postId,
        driverUserId,
        driverName,
        driverHandle: driverProfile?.handle || null,
        driverVideoUrl: driverProfile?.video_url || null,
        price,
        message: `${driverName} wants your ride!`,
      }).catch(() => {});

      // Count total interested drivers
      const countRows = await sql`SELECT COUNT(*) as count FROM ride_interests WHERE post_id = ${postId} AND status = 'interested'`;
      const interestCount = Number((countRows[0] as Record<string, unknown>).count);

      publishAdminEvent('driver_interested', { postId, driverUserId, driverName, interestCount }).catch(() => {});

      return NextResponse.json({ status: 'interested', interestCount });
    }

    // ── DIRECT BOOKINGS: Instant match (driver was specifically chosen) ──
    const [riderActiveRides, driverActiveRides] = await Promise.all([
      // Only block on rides that are ACTUALLY in progress right now. A
      // future-scheduled 'matched' ride doesn't prevent taking another
      // booking at a different time — checkDriverAvailability below handles
      // time-overlap for future rides via the calendar.
      sql`SELECT id FROM rides WHERE rider_id = ${riderId} AND status IN ('otw','here','active') LIMIT 1`,
      sql`SELECT id FROM rides WHERE driver_id = ${driverUserId} AND status IN ('otw','here','active') LIMIT 1`,
    ]);

    if (riderActiveRides.length) {
      return NextResponse.json({ error: 'This rider already has an active ride' }, { status: 409 });
    }
    if (driverActiveRides.length) {
      return NextResponse.json({ error: 'You already have an active ride' }, { status: 409 });
    }

    // Re-verify the slot is still clean before promoting. The driver could
    // have picked up another future booking after the tentative hold was
    // placed. A self-hold match is fine — that's this booking's own row.
    const directWindow = resolveBookingWindow(timeWindow || {});
    const directAvail = await checkDriverAvailability(
      driverUserId,
      directWindow.startAt,
      directWindow.endAt,
      { strict: !isCash }
    );
    if (!directAvail.available && directAvail.conflict && directAvail.conflict.bookingType !== 'hold') {
      return NextResponse.json({
        error: 'Your schedule changed — you already have a booking at this time',
        code: 'schedule_conflict',
      }, { status: 409 });
    }

    // Get driver's wait time setting
    const waitRows = await sql`SELECT wait_minutes FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1`;
    const waitMinutes = Number((waitRows[0] as Record<string, unknown>)?.wait_minutes ?? 10);

    // Driver's market timezone — only used as the fallback when the post was
    // saved without a pre-computed timeDisplay (legacy data, edge cases).
    const driverMarket = await resolveMarketForUser(driverUserId);

    // Update this post to matched
    await sql`UPDATE hmu_posts SET status = 'matched' WHERE id = ${postId}`;

    // Cascade: expire all OTHER active posts for this rider
    await sql`
      UPDATE hmu_posts SET status = 'expired'
      WHERE user_id = ${riderId}
        AND id != ${postId}
        AND status = 'active'
        AND post_type IN ('rider_request', 'direct_booking')
    `;

    // Create ride record
    const refCode = generateRefCode();
    const rideRows = await sql`
      INSERT INTO rides (
        driver_id, rider_id, status, amount, final_agreed_price,
        price_mode, price_accepted_at,
        hmu_post_id, agreement_summary,
        dispute_window_minutes, is_cash, wait_minutes, ref_code
      ) VALUES (
        ${driverUserId}, ${riderId}, 'matched', ${price}, ${price},
        'proposed', NOW(),
        ${postId}, ${JSON.stringify({
          destination: timeWindow.destination || timeWindow.note || '',
          pickup: timeWindow.pickup || '',
          dropoff: timeWindow.dropoff || '',
          time: timeWindow.time || 'ASAP',
          resolvedTime: timeWindow.resolvedTime || directWindow.startAt,
          timeDisplay: timeWindow.timeDisplay || parseNaturalTime(String(timeWindow.time || ''), driverMarket.timezone).display,
          stops: timeWindow.stops || 'none',
          roundTrip: timeWindow.round_trip === true,
          areas,
          price,
        })}::jsonb,
        ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '5')},
        ${isCash},
        ${waitMinutes},
        ${refCode}
      )
      RETURNING id, ref_code
    `;

    const rideId = (rideRows[0] as { id: string }).id;

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

    // Block the driver's calendar — must not be fire-and-forget.
    try {
      await confirmTentativeBooking(driverUserId, riderId, rideId, postId, directWindow.startAt, post.market_id as string || null);
    } catch (e) {
      console.error('confirmTentativeBooking failed, creating directly:', e);
      try {
        await createRideBooking(driverUserId, riderId, rideId, directWindow.startAt, post.market_id as string || null);
      } catch (e2) {
        console.error('createRideBooking also failed:', e2);
      }
    }

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
