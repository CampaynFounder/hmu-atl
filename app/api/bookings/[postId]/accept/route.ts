import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser, publishAdminEvent, publishToChannel } from '@/lib/ably/server';
import { notifyUserWithPush } from '@/lib/notify';
import { afterResponse } from '@/lib/runtime/after-response';
import { notifyRiderBookingAccepted, notifyDriverDownBadTaken } from '@/lib/sms/textbee';
import {
  checkDriverAvailability,
  confirmTentativeBooking,
  createRideBooking,
  resolveBookingWindow,
} from '@/lib/schedule/conflicts';
import { parseNaturalTime } from '@/lib/schedule/parse-time';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { generateRefCode } from '@/lib/rides/ref-code';
import { driverAllowsCashOnly } from '@/lib/payments/strategies';
import { maybePlacePartnerHold } from '@/lib/partner/booking-hold';

export async function POST(
  req: NextRequest,
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
        AND (
          (post_type = 'direct_booking' AND status = 'active' AND target_driver_id = ${driverUserId} AND booking_expires_at > NOW())
          OR
          (post_type = 'rider_request' AND status = 'active' AND expires_at > NOW())
          OR
          (post_type = 'blast' AND status = 'active' AND expires_at > NOW())
          OR
          (post_type = 'down_bad' AND status IN ('active', 'matched') AND expires_at > NOW())
        )
      LIMIT 1
    `;

    // Down Bad posts require the driver to have explicitly opted in.
    if (postRows.length && (postRows[0] as Record<string, unknown>).post_type === 'down_bad') {
      const dpRows = await sql`
        SELECT accepts_down_bad FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
      `;
      if (!dpRows.length || !(dpRows[0] as Record<string, unknown>).accepts_down_bad) {
        return NextResponse.json({ error: 'Enable Down Bad in your profile settings first', code: 'down_bad_not_enabled' }, { status: 403 });
      }
    }

    if (!postRows.length) {
      return NextResponse.json({ error: 'Request not found or expired' }, { status: 404 });
    }

    const post = postRows[0] as Record<string, unknown>;
    const riderId = post.user_id as string;
    const price = Number(post.price || 0);
    const timeWindow = (post.time_window || {}) as Record<string, unknown>;
    const areas = (post.areas || []) as string[];
    // The post may have been created with is_cash=true, but the driver's
    // active pricing strategy gets the final say — deposit-only forces digital
    // every time so the cash-only path stays disabled.
    const cashAllowed = await driverAllowsCashOnly(driverUserId);
    const isCash = cashAllowed ? ((post.is_cash as boolean) || false) : false;

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
    const isBlast = post.post_type === 'blast';

    // ── BLAST: write to blast_driver_targets and ping the rider's offer board ──
    // Driver UI is the same as a regular open request — no special UI on this side.
    // The rider picks a driver via /api/blast/[id]/select; this endpoint just
    // records the interest and surfaces it on the rider's live offer board.
    if (isBlast) {
      const driverActiveRides = await sql`
        SELECT id FROM rides WHERE driver_id = ${driverUserId} AND status IN ('otw','here','active') LIMIT 1
      `;
      if (driverActiveRides.length) {
        return NextResponse.json({ error: 'You already have an active ride' }, { status: 409 });
      }

      // Optional driver-supplied counter price comes through req.json().
      let counterPrice: number | null = null;
      try {
        const body = await req.json().catch(() => ({})) as { counter_price?: number };
        if (typeof body.counter_price === 'number' && body.counter_price > 0) {
          counterPrice = body.counter_price;
        }
      } catch { /* no body is fine */ }

      const updated = await sql`
        UPDATE blast_driver_targets
           SET hmu_at = NOW(),
               hmu_counter_price = ${counterPrice}
         WHERE blast_id = ${postId}
           AND driver_id = ${driverUserId}
           AND hmu_at IS NULL
           AND passed_at IS NULL
         RETURNING id
      `;
      if (!updated.length) {
        // Driver not in the target list (e.g., found the post via shortcode link
        // shared by a friend) — insert a self-added target with a synthesized
        // 0 score so the rider can still see them.
        await sql`
          INSERT INTO blast_driver_targets (blast_id, driver_id, match_score, hmu_at, hmu_counter_price, score_breakdown)
          VALUES (${postId}, ${driverUserId}, 0, NOW(), ${counterPrice}, '{"self_added":1}'::jsonb)
          ON CONFLICT (blast_id, driver_id) DO UPDATE
            SET hmu_at = NOW(),
                hmu_counter_price = ${counterPrice}
        `;
      }

      // Live update to the rider's offer board.
      publishToChannel(`blast:${postId}`, 'target_hmu', {
        blastId: postId,
        driverUserId,
        driverName: driverName,
        driverHandle: driverProfile?.handle || null,
        driverVideoUrl: driverProfile?.video_url || null,
        counterPrice,
      }).catch(() => {});

      return NextResponse.json({ status: 'hmu', blast: true, counterPrice });
    }

    // ── DOWN BAD: First driver to RUN IT wins — instant match ──
    const isDownBad = post.post_type === 'down_bad';

    if (isDownBad) {
      const [riderActiveRides, driverActiveRides] = await Promise.all([
        sql`SELECT id FROM rides WHERE rider_id = ${riderId} AND status IN ('otw','here','active') LIMIT 1`,
        sql`SELECT id FROM rides WHERE driver_id = ${driverUserId} AND status IN ('otw','here','active') LIMIT 1`,
      ]);
      if (riderActiveRides.length) {
        return NextResponse.json({ error: 'This rider already has an active ride' }, { status: 409 });
      }
      if (driverActiveRides.length) {
        return NextResponse.json({ error: 'You already have an active ride' }, { status: 409 });
      }

      // Atomic claim — first driver wins; any concurrent accept gets 409.
      const claimed = await sql`
        UPDATE hmu_posts SET status = 'matched'
        WHERE id = ${postId} AND status = 'active' AND post_type = 'down_bad'
        RETURNING id
      `;
      if (!claimed.length) {
        return NextResponse.json({ error: 'Someone else already ran it — post is gone', code: 'already_matched' }, { status: 409 });
      }

      const waitRows = await sql`SELECT wait_minutes FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1`;
      const waitMinutes = Number((waitRows[0] as Record<string, unknown>)?.wait_minutes ?? 10);

      const refCode = generateRefCode();
      const rideRows = await sql`
        INSERT INTO rides (
          driver_id, rider_id, status, amount, final_agreed_price,
          price_mode, price_accepted_at, hmu_post_id,
          pickup_address, pickup_lat, pickup_lng,
          dropoff_address, dropoff_lat, dropoff_lng,
          dispute_window_minutes, is_cash, wait_minutes, ref_code,
          booking_type
        ) VALUES (
          ${driverUserId}, ${riderId}, 'matched', ${price}, ${price},
          'proposed', NOW(), ${postId},
          ${(post.pickup_address as string) || null},
          ${post.pickup_lat ? Number(post.pickup_lat) : null},
          ${post.pickup_lng ? Number(post.pickup_lng) : null},
          ${(post.dropoff_address as string) || null},
          ${post.dropoff_lat ? Number(post.dropoff_lat) : null},
          ${post.dropoff_lng ? Number(post.dropoff_lng) : null},
          ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '5')},
          false, ${waitMinutes}, ${refCode},
          'down_bad'
        )
        RETURNING id
      `;
      const rideId = (rideRows[0] as { id: string }).id;

      await notifyUserWithPush(riderId, 'booking_accepted', {
        rideId, postId, driverUserId, driverName, price,
        message: `${driverName} is running it!`,
      }, {
        title: 'Ride accepted 🤝',
        body: `${driverName} is running it${price ? ` — $${price}` : ''}.`,
        data: { type: 'booking_accepted', rideId },
      }).catch(() => {});

      await publishRideUpdate(rideId, 'status_change', {
        status: 'matched',
        message: 'Down Bad matched — driver incoming!',
      }).catch(() => {});

      publishAdminEvent('ride_created', { rideId, driverUserId, riderId, price, status: 'matched', postType: 'down_bad' }).catch(() => {});

      // FOMO SMS — fire-and-forget to all other market drivers who got the initial notification
      sql`
        SELECT u.id, COALESCE(dp.phone, u.phone) AS phone
        FROM users u
        JOIN driver_profiles dp ON dp.user_id = u.id
        WHERE u.market_id = (SELECT market_id FROM users WHERE id = ${riderId} LIMIT 1)
          AND u.id != ${driverUserId}
          AND COALESCE(dp.phone, u.phone) IS NOT NULL
          AND dp.account_status = 'active'
          AND COALESCE(dp.sms_enabled, TRUE) = TRUE
      `.then((rows: { id: string; phone: string }[]) => {
        for (const row of rows) {
          notifyDriverDownBadTaken(row.phone, { userId: row.id, market: 'atl' }).catch(() => {});
        }
      }).catch(() => {});

      return NextResponse.json({ status: 'matched', rideId });
    }

    // ── OPEN REQUESTS: Register interest (rider picks later) ──
    if (!isDirectBooking) {
      // Block only if driver explicitly passed this post (different intent from re-accepting).
      // A pre-existing 'interested' row is fine — treat accept as idempotent.
      const [existingPassed, driverActiveRides] = await Promise.all([
        sql`SELECT id FROM ride_interests WHERE post_id = ${postId} AND driver_id = ${driverUserId} AND status = 'passed' LIMIT 1`,
        sql`SELECT id FROM rides WHERE driver_id = ${driverUserId} AND status IN ('otw','here','active') LIMIT 1`,
      ]);

      if (existingPassed.length) {
        return NextResponse.json({ error: 'You already passed on this ride' }, { status: 409 });
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

    // Resolve pickup/dropoff text: prefer the dedicated hmu_posts columns (set
    // for direct bookings once this migration shipped); fall back to the JSONB
    // fields that the NLP parser populates in time_window.
    const pickupAddr = (post.pickup_address as string | null)
      || (timeWindow.pickup as string | undefined)
      || null;
    const dropoffAddr = (post.dropoff_address as string | null)
      || (timeWindow.dropoff as string | undefined)
      || (timeWindow.destination as string | undefined)
      || null;
    const directTripType = timeWindow.round_trip === true ? 'round_trip' : 'one_way';
    const directStops = Array.isArray(timeWindow.stops) ? timeWindow.stops : [];

    // Create ride record
    const refCode = generateRefCode();
    const rideRows = await sql`
      INSERT INTO rides (
        driver_id, rider_id, status, amount, final_agreed_price,
        price_mode, price_accepted_at,
        hmu_post_id, agreement_summary,
        pickup_address, dropoff_address,
        trip_type, stops,
        dispute_window_minutes, is_cash, wait_minutes, ref_code
      ) VALUES (
        ${driverUserId}, ${riderId}, 'matched', ${price}, ${price},
        'proposed', NOW(),
        ${postId}, ${JSON.stringify({
          destination: timeWindow.destination || timeWindow.note || '',
          pickup: pickupAddr || '',
          dropoff: dropoffAddr || '',
          time: timeWindow.time || 'ASAP',
          resolvedTime: timeWindow.resolvedTime || directWindow.startAt,
          timeDisplay: timeWindow.timeDisplay || parseNaturalTime(String(timeWindow.time || ''), driverMarket.timezone).display,
          stops: directStops,
          roundTrip: directTripType === 'round_trip',
          areas,
          price,
        })}::jsonb,
        ${pickupAddr}, ${dropoffAddr},
        ${directTripType}, ${JSON.stringify(directStops)}::jsonb,
        ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '5')},
        ${isCash},
        ${waitMinutes},
        ${refCode}
      )
      RETURNING id, ref_code
    `;

    const rideId = (rideRows[0] as { id: string }).id;

    // The ride is created and the post is marked matched (above) — that's the
    // driver's success, so RETURN NOW. Everything below is best-effort
    // notification + bookkeeping; awaiting it (partner hold, push, Ably, SMS,
    // calendar confirm) on a cold Neon compute could push the response past the
    // mobile client's 30s timeout, so `handleHmu` never receives `rideId` to
    // navigate with — the ride matches server-side but the driver is stranded on
    // the feed until an app restart. Defer it all to ctx.waitUntil(). Same fix
    // as the COO route (#420).
    afterResponse(async () => {
      // Partner delivery bookings: place the delivery-fee hold now that a ride
      // exists. No-ops for normal bookings, and never throws.
      await maybePlacePartnerHold(postId, rideId, driverUserId).catch((e) => {
        console.error('maybePlacePartnerHold threw (ignored):', e);
      });

      // Notify rider via Ably + push that the driver accepted.
      await notifyUserWithPush(riderId, 'booking_accepted', {
        rideId,
        postId,
        driverUserId,
        driverName,
        price,
        message: `${driverName} accepted your ride!`,
      }, {
        title: 'Ride accepted 🤝',
        body: `${driverName} accepted your ride${price ? ` — $${price}` : ''}.`,
        data: { type: 'booking_accepted', rideId },
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
          await notifyRiderBookingAccepted(riderPhone, driverName, rideId).catch(() => {});
        }
      } catch { /* non-blocking */ }

      // Block the driver's calendar — kept here (not fire-and-forget) so
      // ctx.waitUntil() keeps the isolate alive until it completes.
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
    });

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
