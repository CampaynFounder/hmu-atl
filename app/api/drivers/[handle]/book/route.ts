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
import {
  checkDriverAvailability,
  createTentativeBooking,
  cancelTentativeBooking,
  resolveBookingWindow,
} from '@/lib/schedule/conflicts';
import { logSuspectEvent } from '@/lib/admin/suspect-events';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { resolveMarketForUser } from '@/lib/markets/resolver';
import { parseRoute, resolveProvidedSlugs } from '@/lib/markets/parse-areas';
import { parseNaturalTime } from '@/lib/schedule/parse-time';

// Cap total booking submissions per rider per hour. The structural
// getActiveDirectBooking() check already prevents duplicate active bookings
// to the SAME driver, so this only has to cover aggregate spam across drivers.
const LIMIT_BOOKINGS_PER_HOUR = 5;

/** Strip city, state, zip, directional prefixes from address for shorter SMS */
function stripAddress(addr: string): string {
  if (!addr) return '';
  return addr
    .replace(/,?\s*(Atlanta|ATL|GA|Georgia)\b/gi, '')
    .replace(/,?\s*\d{5}(-\d{4})?/g, '')               // zip
    .replace(/\b(Southwest|Southeast|Northwest|Northeast|NW|NE|SW|SE)\b/gi, '') // directionals
    .replace(/,?\s*(United States|US|USA)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/, '')
    .replace(/^\s*,\s*/, '')
    .trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { handle } = await params;

  let body: {
    price: number;
    areas?: string[];
    timeWindow?: Record<string, unknown>;
    is_cash?: boolean;
    pickup_area_slug?: string | null;
    dropoff_area_slug?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { price, timeWindow, is_cash } = body;
  if (!price) {
    return NextResponse.json({ error: 'price is required' }, { status: 400 });
  }

  // Resolve IDs
  const [riderRows, driverRows] = await Promise.all([
    sql`SELECT id, account_status FROM users WHERE clerk_id = ${clerkId} LIMIT 1`,
    sql`SELECT user_id, areas, enforce_minimum, accepts_cash, cash_only, (pricing->>'minimum')::numeric as min_ride_price FROM driver_profiles WHERE handle = ${handle} LIMIT 1`,
  ]);

  if (!riderRows.length) return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
  if (!driverRows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

  const rider = riderRows[0] as { id: string; account_status: string };
  const driverProfile = driverRows[0] as { user_id: string; areas: string[]; enforce_minimum: boolean; accepts_cash: boolean | null; cash_only: boolean | null; min_ride_price: number | null };
  const driverUserId = driverProfile.user_id;

  // Clamp is_cash to the driver's payment config — never trust the client.
  // Keeps the driver SMS, payment gate, and scheduling policy in sync with
  // what the driver actually offers, regardless of stale chat state.
  //   cash_only             → forced true
  //   !accepts_cash         → forced false (digital-only driver)
  //   accepts_cash + !cash_only → honor rider's choice
  const resolvedIsCash = driverProfile.cash_only === true
    ? true
    : driverProfile.accepts_cash !== true
    ? false
    : is_cash === true;

  // Structural self-booking guard — rider and driver cannot be the same user.
  // Backs up the UI blocker on /d/[handle] in case someone calls the API directly
  // or uses a dual-profile account in a future release.
  if (rider.id === driverUserId) {
    await logSuspectEvent(rider.id, 'self_booking_attempt', { driverHandle: handle });
    return NextResponse.json(
      { error: 'You can\'t book yourself. Try another driver.', code: 'self_booking' },
      { status: 403 }
    );
  }

  // Hourly booking rate limit — fires on ACTUAL booking submissions, not
  // chat summaries. Dismissing a chat doesn't increment this. The structural
  // "one active booking per rider-driver pair" check below handles the
  // "spam one driver" case, so we only cap aggregate spam.
  const bookRate = await checkRateLimit({
    key: `book:rider:${rider.id}`,
    limit: LIMIT_BOOKINGS_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!bookRate.ok) {
    await logSuspectEvent(rider.id, 'booking_rate', {
      count: bookRate.count,
      limit: bookRate.limit,
      driverHandle: handle,
    });
    return NextResponse.json(
      {
        error: 'You\'ve submitted a lot of booking requests lately. Give the drivers a chance to respond, then try again in a bit.',
        code: 'booking_rate_limit',
        retryAfter: bookRate.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

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

  // Block only if rider is in a ride RIGHT NOW (OTW/here/active). A
  // future 'matched' booking doesn't stop them from scheduling another
  // ride — the driver-availability check handles time-overlap.
  const activeRides = await sql`SELECT id FROM rides WHERE rider_id = ${rider.id} AND status IN ('otw','here','active') LIMIT 1`;
  if (activeRides.length) {
    return NextResponse.json({ error: 'You already have an active ride', code: 'active_ride' }, { status: 409 });
  }

  // Auto-expire stale bookings before checking
  await sql`
    UPDATE hmu_posts SET status = 'expired'
    WHERE user_id = ${rider.id} AND post_type = 'direct_booking'
      AND status = 'active' AND booking_expires_at < NOW()
  `;

  // Check for an existing active booking to this driver
  const existing = await getActiveDirectBooking(rider.id, driverUserId);
  if (existing) {
    return NextResponse.json(
      { error: 'You already have an active booking request with this driver', postId: existing.id, expiresAt: existing.booking_expires_at },
      { status: 409 }
    );
  }

  // Re-run eligibility server-side (never trust client)
  const eligibility = await checkRiderEligibility(rider.id, driverUserId, resolvedIsCash);
  if (!eligibility.eligible) {
    return NextResponse.json({ error: eligibility.reason, code: eligibility.code }, { status: 403 });
  }

  // Check driver availability for the requested time — same window for
  // "now" and future so two riders can't race on the same slot before the
  // ride record exists. Strict for non-cash (held card → chargebacks if we
  // double-book), loose for cash (only an actively running ride blocks).
  //
  // Duration resolution order:
  //  1) explicit estimated_minutes from the chat flow (round-trip aware,
  //     Mapbox-backed)
  //  2) round_trip flag with a 90-min fallback
  //  3) resolveBookingWindow's 45-min default for one-way
  const tw = (timeWindow || {}) as Record<string, unknown>;
  const rawMinutes = Number(tw.estimated_minutes);
  const isRoundTrip = !!tw.round_trip;
  const estimatedMinutes = Number.isFinite(rawMinutes) && rawMinutes > 0
    ? Math.round(rawMinutes)
    : isRoundTrip
    ? 90
    : undefined;
  const window = resolveBookingWindow(tw, estimatedMinutes);
  const avail = await checkDriverAvailability(
    driverUserId,
    window.startAt,
    window.endAt,
    { strict: !resolvedIsCash }
  );
  if (!avail.available && avail.conflict) {
    return NextResponse.json(
      { error: 'This driver already has a booking at that time. Try a different time.', code: 'schedule_conflict' },
      { status: 409 }
    );
  }

  const market = await resolveMarketForUser(rider.id);
  // Driver's market is the wall-clock anchor for the typed time. For most
  // bookings this matches the rider's market; cross-market bookings still
  // resolve "5pm" against where the ride actually happens.
  const driverMarket = await resolveMarketForUser(driverUserId);

  // Prefer UI-picked slugs; fall back to parsing pickup/dropoff/destination
  // strings from the chat booking flow.
  const twForParse = (timeWindow || {}) as Record<string, unknown>;
  const routeText = [
    twForParse.pickup as string | undefined,
    twForParse.dropoff as string | undefined,
  ].filter(Boolean).join(' > ')
    || (twForParse.destination as string | undefined)
    || (twForParse.message as string | undefined)
    || '';

  const route = (body.pickup_area_slug || body.dropoff_area_slug)
    ? await resolveProvidedSlugs(market.market_id, body.pickup_area_slug, body.dropoff_area_slug)
    : await parseRoute(routeText, market.market_id);

  // Server-side time resolution for the non-chat booking path. The chat flow
  // already supplies resolvedTime + timeDisplay; this fills them in when the
  // rider typed time directly into the drawer. Parser is keyed on the
  // driver's market timezone so wall-clock matches where the ride happens.
  const resolvedTimeWindow = { ...((timeWindow || {}) as Record<string, unknown>) };
  const rawTime = typeof resolvedTimeWindow.time === 'string' ? resolvedTimeWindow.time.trim() : '';
  if (rawTime && !resolvedTimeWindow.timeDisplay) {
    try {
      const parsed = parseNaturalTime(rawTime, driverMarket.timezone);
      resolvedTimeWindow.resolvedTime = resolvedTimeWindow.resolvedTime || parsed.iso;
      resolvedTimeWindow.timeDisplay = parsed.display;
      resolvedTimeWindow.isNow = parsed.isNow;
    } catch {
      /* leave as raw text — drawer/SMS still render something */
    }
  }

  const post = await createDirectBookingPost({
    riderId: rider.id,
    driverUserId,
    marketId: market.market_id,
    price,
    areas,
    pickupAreaSlug: route.pickup_area_slug,
    dropoffAreaSlug: route.dropoff_area_slug,
    dropoffInMarket: route.dropoff_in_market,
    timeWindow: resolvedTimeWindow,
    isCash: resolvedIsCash,
  });

  // Always create a tentative hold — "now" bookings need the same
  // double-book protection during the 15-min acceptance window. Pass the
  // resolved duration so round-trip and Mapbox-backed estimates from the
  // chat flow land on the calendar row instead of defaulting to 45 min.
  try {
    await createTentativeBooking(driverUserId, rider.id, post.id, window.startAt, null, estimatedMinutes);
  } catch (e) {
    console.error('Tentative booking failed:', e);
  }

  // Fire Ably notification to driver
  try {
    await notifyUser(driverUserId, 'direct_booking_request', {
      postId: post.id, price, areas, expiresAt: post.booking_expires_at,
    });
  } catch (e) {
    console.error('Ably notify failed:', e);
  }

  // SMS notification to driver — inline VoIP.ms call to bypass any env issues
  try {
    const driverPhoneRows = await sql`
      SELECT phone, payout_setup_complete FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
    `;
    const driverPhone = (driverPhoneRows[0] as Record<string, unknown>)?.phone as string;
    const payoutSetup = !!(driverPhoneRows[0] as Record<string, unknown>)?.payout_setup_complete;
    const riderNameRows = await sql`
      SELECT rp.handle, rp.display_name FROM rider_profiles rp WHERE rp.user_id = ${rider.id} LIMIT 1
    `;
    const riderRow = riderNameRows[0] as Record<string, unknown> | undefined;
    const riderName = (riderRow?.handle as string) || (riderRow?.display_name as string) || 'A rider';

    if (driverPhone) {
      const tw = resolvedTimeWindow;
      const pickupRaw = (tw.pickup as string) || '';
      const dropoffRaw = (tw.dropoff as string) || '';
      const dest = pickupRaw && dropoffRaw
        ? `${stripAddress(pickupRaw)} > ${stripAddress(dropoffRaw)}`
        : stripAddress((tw.destination as string) || '');
      // Prefer market-tz display string; raw text only when parsing failed.
      const when = (tw.timeDisplay as string) || (tw.time as string) || '';

      // Build cash ride suffix if applicable
      let cashSuffix = '';
      if (resolvedIsCash) {
        try {
          const cashRows = await sql`
            SELECT cash_rides_remaining, cash_pack_balance FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
          `;
          const cashInfo = cashRows[0] as { cash_rides_remaining: number; cash_pack_balance: number } | undefined;
          const remaining = (cashInfo?.cash_rides_remaining ?? 0) + (cashInfo?.cash_pack_balance ?? 0);
          cashSuffix = ` CASH. ${remaining} left`;
        } catch { cashSuffix = ' CASH'; }
      }

      // Keep under 160 chars — VoIP.ms rejects longer messages
      let smsMsg: string;
      if (!payoutSetup) {
        smsMsg = `HMU: ${riderName} wants a ride. $${price}${dest ? ' ' + dest : ''}${cashSuffix}. Link payout: atl.hmucashride.com/driver/payout-setup`;
      } else {
        smsMsg = `HMU: ${riderName} wants a ride. $${price}${dest ? ' ' + dest : ''}${cashSuffix}. 15min. atl.hmucashride.com/driver/home`;
      }
      // Truncate to 160 if still too long
      if (smsMsg.length > 160) smsMsg = smsMsg.slice(0, 157) + '...';

      // Direct VoIP.ms call
      const dst = driverPhone.replace(/\D/g, '').replace(/^1/, '');
      const smsParams = new URLSearchParams({
        api_username: process.env.VOIPMS_API_USERNAME || '',
        api_password: process.env.VOIPMS_API_PASSWORD || '',
        method: 'sendSMS',
        did: process.env.VOIPMS_DID_ATL || '',
        dst,
        message: smsMsg,
      });

      console.log('[BOOK-SMS] Sending to:', dst, '| DID:', process.env.VOIPMS_DID_ATL || 'MISSING', '| Username:', process.env.VOIPMS_API_USERNAME || 'MISSING');

      const smsRes = await fetch(`https://voip.ms/api/v1/rest.php?${smsParams.toString()}`);
      const smsData = await smsRes.json();
      console.log('[BOOK-SMS] Result:', JSON.stringify(smsData));

      // Log to DB
      await sql`
        INSERT INTO sms_log (to_phone, from_did, message, status, voipms_status, event_type, market)
        VALUES (${dst}, ${process.env.VOIPMS_DID_ATL || 'unknown'}, ${smsMsg}, ${smsData.status === 'success' ? 'sent' : 'failed'}, ${smsData.status}, 'new_booking', 'atl')
      `;
    }
  } catch (e) {
    console.error('[BOOK-SMS] Error:', e);
  }

  return NextResponse.json({ postId: post.id, expiresAt: post.booking_expires_at }, { status: 201 });
}

// DELETE — rider cancels their active booking request
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { handle } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  const driverRows = await sql`SELECT user_id FROM driver_profiles WHERE handle = ${handle} LIMIT 1`;
  if (!driverRows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  const driverUserId = (driverRows[0] as { user_id: string }).user_id;

  const result = await sql`
    UPDATE hmu_posts SET status = 'cancelled'
    WHERE user_id = ${riderId}
      AND target_driver_id = ${driverUserId}
      AND post_type = 'direct_booking'
      AND status = 'active'
    RETURNING id
  `;

  if (!result.length) {
    return NextResponse.json({ error: 'No active booking to cancel' }, { status: 404 });
  }

  // Release the tentative calendar hold
  const cancelledPostId = (result[0] as { id: string }).id;
  cancelTentativeBooking(cancelledPostId).catch(() => {});

  return NextResponse.json({ status: 'cancelled', postId: (result[0] as { id: string }).id });
}
