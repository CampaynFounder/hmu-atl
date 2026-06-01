// POST /api/blast/[id]/select/[targetId] — rider locks the match.
//
// LAX CREATION MODEL (founder direction 2026-05-13):
//   The blast was created without a deposit hold. This endpoint is where the
//   rider commits financially — we check for a saved card, return 412 with a
//   returnUrl if missing (frontend redirects to card-add), and only then run
//   the atomic match claim + deposit PaymentIntent.
//
// Race-safe: an atomic UPDATE … WHERE status='active' RETURNING id ensures only
// the first call wins. Subsequent calls (or races) get 409.
//
// On success:
//   - hmu_posts.status → 'matched'; deposit PI id + amount persisted
//   - blast_driver_targets: this row gets selected_at; other rows get rejected_at
//   - rides row created (status='matched')
//   - Ably: blast:{id} gets `match_locked`; each loser gets blast_taken on
//     user:{driver_id}:notify
//
// Spec: docs/BLAST-BOOKING-SPEC.md §5.2

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { publishToChannel, notifyUser } from '@/lib/ably/server';
import { generateRefCode } from '@/lib/rides/ref-code';
import { getMatchingConfig } from '@/lib/blast/config';
import { insertScheduleBlock } from '@/lib/blast/lifecycle';
import { estimateTripBlockMinutes } from '@/lib/geo/distance';
import { sendBlastTakenSms } from '@/lib/blast/notify';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;

  // Pull rider + payment-method state up front. Card check happens BEFORE the
  // atomic claim so a missing card doesn't wedge the blast into 'matched'.
  const userRows = await sql`
    SELECT u.id, rp.stripe_customer_id
    FROM users u
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userRow = userRows[0] as { id: string; stripe_customer_id: string | null };
  const riderId = userRow.id;
  const stripeCustomerId = userRow.stripe_customer_id;

  const pmRows = stripeCustomerId
    ? await sql`
        SELECT stripe_payment_method_id FROM rider_payment_methods
        WHERE rider_id = ${riderId} AND is_default = true LIMIT 1
      `
    : [];
  const paymentMethodId = (pmRows[0] as { stripe_payment_method_id: string } | undefined)?.stripe_payment_method_id;

  if (!stripeCustomerId || !paymentMethodId) {
    // returnUrl puts the rider back on the offer board after they add a card,
    // so the second Match tap proceeds with the deposit hold.
    return NextResponse.json(
      {
        error: 'PAYMENT_METHOD_REQUIRED',
        message: 'Add a payment method to lock in this driver',
        returnUrl: `/rider/blast/${blastId}`,
      },
      { status: 412 },
    );
  }

  // Atomic claim: status must be 'active' to flip. The RETURNING tells us if
  // we won the race.
  const claim = await sql`
    UPDATE hmu_posts
       SET status = 'matched'
     WHERE id = ${blastId}
       AND user_id = ${riderId}
       AND post_type = 'blast'
       AND status = 'active'
       AND expires_at > NOW()
     RETURNING id, price, pickup_address, dropoff_address,
               pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
               scheduled_for, trip_type, stops, areas, time_window
  `;
  if (!claim.length) {
    return NextResponse.json(
      { error: 'CONFLICT', message: 'Blast already matched, cancelled, or expired' },
      { status: 409 },
    );
  }
  const post = claim[0] as Record<string, unknown>;

  // Confirm the chosen target exists and belongs to this blast. Capture the
  // counter price if the driver countered (rider sees it explicitly per spec).
  const targetRows = await sql`
    SELECT bdt.id, bdt.driver_id, bdt.hmu_at, bdt.hmu_counter_price,
           dp.handle, dp.display_name, dp.phone
    FROM blast_driver_targets bdt
    JOIN driver_profiles dp ON dp.user_id = bdt.driver_id
    WHERE bdt.id = ${targetId} AND bdt.blast_id = ${blastId} LIMIT 1
  `;
  if (!targetRows.length) {
    // Roll back the claim so the blast can be re-selected.
    await sql`UPDATE hmu_posts SET status = 'active' WHERE id = ${blastId}`;
    return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  }
  const target = targetRows[0] as Record<string, unknown>;
  if (!target.hmu_at) {
    await sql`UPDATE hmu_posts SET status = 'active' WHERE id = ${blastId}`;
    return NextResponse.json(
      { error: 'TARGET_NOT_INTERESTED', message: 'This driver hasn\'t HMU\'d yet' },
      { status: 400 },
    );
  }

  const driverId = target.driver_id as string;
  const finalPrice = target.hmu_counter_price !== null
    ? Number(target.hmu_counter_price)
    : Number(post.price);

  // Authorize the deposit hold against the rider's saved card. Manual capture
  // so the platform can release on completed ride or capture on rider no-show.
  // No transfer_data — the destination is decided when the ride lifecycle
  // ends and we know whether it's release-or-capture.
  const config = await getMatchingConfig();
  const depositCents = Math.min(
    Math.max(
      Math.round(finalPrice * 100 * config.deposit.percent_of_fare),
      config.deposit.default_amount_cents,
    ),
    config.deposit.max_deposit_cents,
  );

  let depositPiId: string | null = null;
  let depositErr: string | null = null;
  try {
    const pi = await stripe.paymentIntents.create({
      amount: depositCents,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
      statement_descriptor_suffix: 'HMU BLAST',
      metadata: { blastId, riderId, driverId, kind: 'blast_deposit' },
    }, { idempotencyKey: `blast_deposit_${blastId}` });
    if (pi.status !== 'requires_capture') {
      depositErr = `unexpected_status:${pi.status}`;
      // PI exists on Stripe but isn't in a usable state (e.g. requires_action
      // for 3DS, requires_payment_method on decline). Cancel best-effort so
      // the rider isn't left with an orphan authorization.
      try { await stripe.paymentIntents.cancel(pi.id); } catch { /* best-effort */ }
    } else {
      depositPiId = pi.id;
    }
  } catch (e) {
    const err = e as { code?: string; decline_code?: string; message?: string };
    depositErr = err.decline_code ?? err.code ?? err.message ?? 'unknown';
  }

  if (depositErr || !depositPiId) {
    // Roll the claim back so the rider can try a different card / driver.
    await sql`UPDATE hmu_posts SET status = 'active' WHERE id = ${blastId}`;
    return NextResponse.json(
      { error: 'DEPOSIT_FAILED', message: depositErr || 'Could not authorize deposit' },
      { status: 402 },
    );
  }

  // Persist the deposit hold on the blast row for downstream release/capture.
  await sql`
    UPDATE hmu_posts
       SET deposit_payment_intent_id = ${depositPiId},
           deposit_amount = ${depositCents / 100}
     WHERE id = ${blastId}
  `;

  // Stamp selected/rejected on targets.
  await sql`
    UPDATE blast_driver_targets
       SET selected_at = NOW()
     WHERE id = ${targetId}
  `;
  await sql`
    UPDATE blast_driver_targets
       SET rejected_at = NOW()
     WHERE blast_id = ${blastId}
       AND id != ${targetId}
       AND selected_at IS NULL
       AND rejected_at IS NULL
  `;

  // Create the ride row. Mirror the shape used by /api/bookings/[postId]/accept.
  const refCode = generateRefCode();
  const timeWindow = (post.time_window as Record<string, unknown>) ?? {};
  const postStops = (post.stops as unknown[]) ?? [];
  const postTripType = (post.trip_type as string) === 'round_trip' ? 'round_trip' : 'one_way';
  const rideRows = await sql`
    INSERT INTO rides (
      driver_id, rider_id, status, amount, final_agreed_price,
      price_mode, price_accepted_at,
      hmu_post_id, agreement_summary,
      dispute_window_minutes, is_cash, ref_code,
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng,
      trip_type, stops
    ) VALUES (
      ${driverId}, ${riderId}, 'matched', ${finalPrice}, ${finalPrice},
      'proposed', NOW(),
      ${blastId},
      ${JSON.stringify({
        source: 'blast',
        pickup: post.pickup_address,
        dropoff: post.dropoff_address,
        tripType: postTripType,
        scheduledFor: post.scheduled_for,
        timeDisplay: timeWindow.scheduledFor ?? 'ASAP',
      })}::jsonb,
      ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '5')},
      FALSE,
      ${refCode},
      ${post.pickup_address}, ${post.pickup_lat}, ${post.pickup_lng},
      ${post.dropoff_address}, ${post.dropoff_lat}, ${post.dropoff_lng},
      ${postTripType}, ${JSON.stringify(postStops)}::jsonb
    )
    RETURNING id, ref_code
  `;
  const rideId = (rideRows[0] as { id: string }).id;

  // Insert a soft schedule block anchored to the ride's scheduled time.
  // Pull-up will promote this to hard. Released automatically on blast
  // cancel or if the rider never pulls up.
  const blockFrom = post.scheduled_for ? new Date(post.scheduled_for as string) : new Date();
  const blockMinutes = estimateTripBlockMinutes(
    { latitude: Number(post.pickup_lat), longitude: Number(post.pickup_lng) },
    { latitude: Number(post.dropoff_lat), longitude: Number(post.dropoff_lng) },
  );
  insertScheduleBlock({
    driverId,
    blastId,
    blockType: 'soft',
    blockedFrom: blockFrom,
    blockedUntil: new Date(blockFrom.getTime() + blockMinutes * 60_000),
  }).catch((e) => console.error('[blast/select] schedule block insert failed:', e));

  // Notify everyone.
  publishToChannel(`blast:${blastId}`, 'match_locked', {
    blastId,
    targetId,
    rideId,
    driverId,
    driverName: (target.display_name as string) ?? (target.handle as string) ?? 'Driver',
    finalPrice,
  }).catch(() => {});

  notifyUser(driverId, 'blast_match_won', {
    blastId,
    rideId,
    riderId,
    finalPrice,
    message: 'You got the blast! Heading to OTW soon.',
  }).catch(() => {});

  // Notify losers (push + SMS).
  const loserRows = await sql`
    SELECT driver_id FROM blast_driver_targets
    WHERE blast_id = ${blastId} AND id != ${targetId}
  `;
  const loserIds: string[] = [];
  for (const r of loserRows) {
    const losDriverId = (r as { driver_id: string }).driver_id;
    notifyUser(losDriverId, 'blast_taken', { blastId }).catch(() => {});
    loserIds.push(losDriverId);
  }
  // Awaited — same reason as blast HMU: Cloudflare Workers kill unawaited promises on response
  await sendBlastTakenSms({
    driverIds: loserIds,
    pickup: post.pickup_address as string,
    dropoff: post.dropoff_address as string,
    priceDollars: finalPrice,
    marketSlug: 'atl',
  }).catch(() => {});

  return NextResponse.json({ rideId, refCode, driverId, finalPrice });
}
