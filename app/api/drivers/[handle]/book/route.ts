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
import { checkDriverAvailability, createTentativeBooking, cancelTentativeBooking } from '@/lib/schedule/conflicts';
import { parseNaturalTime } from '@/lib/schedule/parse-time';
import { logSuspectEvent } from '@/lib/admin/suspect-events';

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

  let body: { price: number; areas?: string[]; timeWindow?: Record<string, unknown>; is_cash?: boolean };
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
    sql`SELECT user_id, areas, enforce_minimum, (pricing->>'minimum')::numeric as min_ride_price FROM driver_profiles WHERE handle = ${handle} LIMIT 1`,
  ]);

  if (!riderRows.length) return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
  if (!driverRows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

  const rider = riderRows[0] as { id: string; account_status: string };
  const driverProfile = driverRows[0] as { user_id: string; areas: string[]; enforce_minimum: boolean; min_ride_price: number | null };
  const driverUserId = driverProfile.user_id;

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
  const eligibility = await checkRiderEligibility(rider.id, driverUserId, is_cash);
  if (!eligibility.eligible) {
    return NextResponse.json({ error: eligibility.reason, code: eligibility.code }, { status: 403 });
  }

  // Check driver availability for the requested time (future bookings)
  const tw = (timeWindow || {}) as Record<string, unknown>;
  const rideTimeStr = (tw.resolvedTime as string) || (tw.time as string) || '';
  const parsed = parseNaturalTime(rideTimeStr);
  if (!parsed.isNow) {
    const proposedEnd = new Date(new Date(parsed.iso).getTime() + 45 * 60000).toISOString();
    const avail = await checkDriverAvailability(driverUserId, parsed.iso, proposedEnd);
    if (!avail.available && avail.conflict) {
      return NextResponse.json(
        { error: `${driverProfile.areas?.[0] ? '' : ''}This driver already has a booking at that time. Try a different time.`, code: 'schedule_conflict' },
        { status: 409 }
      );
    }
  }

  const post = await createDirectBookingPost({
    riderId: rider.id,
    driverUserId,
    price,
    areas,
    timeWindow: timeWindow || {},
    isCash: is_cash,
  });

  // Create tentative calendar hold for future bookings (blocks the time slot during acceptance window)
  if (!parsed.isNow) {
    try {
      await createTentativeBooking(driverUserId, rider.id, post.id, parsed.iso, null);
    } catch (e) {
      console.error('Tentative booking failed:', e);
    }
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
      const tw = (timeWindow || {}) as Record<string, unknown>;
      const pickupRaw = (tw.pickup as string) || '';
      const dropoffRaw = (tw.dropoff as string) || '';
      const dest = pickupRaw && dropoffRaw
        ? `${stripAddress(pickupRaw)} > ${stripAddress(dropoffRaw)}`
        : stripAddress((tw.destination as string) || '');
      const when = (tw.time as string) || '';

      // Build cash ride suffix if applicable
      let cashSuffix = '';
      if (is_cash) {
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
