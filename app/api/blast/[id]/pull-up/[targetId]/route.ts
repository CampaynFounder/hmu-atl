// POST /api/blast/[id]/pull-up/[targetId] — rider's single action: match + start ride.
//
// Collapses the former two-step select→pull-up flow into one atomic operation:
//   1. Verifies target has hmu_at (driver said HMU)
//   2. Atomic claim: hmu_posts.status 'active' → 'matched' (first tap wins the race)
//   3. Rider card check + Stripe deposit authorize + immediate capture
//   4. Stamps selected_at + pull_up_at on winning target
//   5. Sets rejected_at on all other targets in this blast
//   6. Creates rides row (status='matched')
//   7. Inserts hard driver schedule block
//   8. Notifies winning driver: blast_match_won → /ride/[id]
//   9. Notifies all other HMU'd drivers: blast_taken
//  10. Broadcasts pull_up_started + match_locked on blast:{id} channel
//
// Idempotent: re-tap after pull_up_at is already stamped returns existing rideId.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { notifyUser, publishToChannel } from '@/lib/ably/server';
import { writeBlastEvent, insertScheduleBlock } from '@/lib/blast/lifecycle';
import { generateRefCode } from '@/lib/rides/ref-code';
import { getMatchingConfig } from '@/lib/blast/config';
import { estimateTripBlockMinutes } from '@/lib/geo/distance';
import { sendBlastTakenSms } from '@/lib/blast/notify';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
): Promise<Response> {
  try {
    return await handlePost(_req, params);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[blast/pull-up] unhandled error:', msg, err);
    return NextResponse.json({ error: 'Internal error', detail: msg }, { status: 500 });
  }
}

async function handlePost(
  _req: NextRequest,
  params: Promise<{ id: string; targetId: string }>,
): Promise<Response> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;

  // Rider identity + Stripe customer ID
  const userRows = await sql`
    SELECT u.id, rp.stripe_customer_id
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
     WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const { id: riderId, stripe_customer_id: stripeCustomerId } =
    userRows[0] as { id: string; stripe_customer_id: string | null };

  // Fetch blast + target in one query
  const rows = await sql`
    SELECT
      p.id AS blast_id, p.user_id AS rider_id, p.status AS blast_status,
      p.price, p.pickup_address, p.pickup_lat, p.pickup_lng,
      p.dropoff_address, p.dropoff_lat, p.dropoff_lng,
      p.scheduled_for, p.trip_type, p.stops, p.time_window,
      p.deposit_payment_intent_id, p.deposit_amount, p.expires_at,
      bdt.id AS target_id, bdt.driver_id,
      bdt.hmu_at, bdt.selected_at, bdt.pull_up_at, bdt.rejected_at,
      bdt.counter_price, bdt.hmu_counter_price,
      dp.handle AS driver_handle, dp.display_name AS driver_display_name
    FROM hmu_posts p
    JOIN blast_driver_targets bdt
      ON bdt.id = ${targetId} AND bdt.blast_id = p.id
    LEFT JOIN driver_profiles dp ON dp.user_id = bdt.driver_id
    WHERE p.id = ${blastId} AND p.post_type = 'blast'
    LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'Target not found' }, { status: 404 });

  const row = rows[0] as Record<string, unknown>;

  if (row.rider_id !== riderId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!row.hmu_at) {
    return NextResponse.json(
      { error: 'TARGET_NOT_INTERESTED', message: "This driver hasn't HMU'd yet" },
      { status: 400 },
    );
  }

  const driverId = row.driver_id as string;
  const driverName = (row.driver_display_name as string) ?? (row.driver_handle as string) ?? 'Driver';

  // Idempotent: already completed → find ride and return
  if (row.pull_up_at) {
    const existingRide = await sql`
      SELECT id FROM rides
       WHERE hmu_post_id = ${blastId} AND driver_id = ${driverId} AND rider_id = ${riderId}
       ORDER BY created_at DESC LIMIT 1
    `;
    return NextResponse.json({
      rideId: (existingRide[0] as { id: string } | undefined)?.id ?? null,
      pullUpAt: row.pull_up_at,
      idempotent: true,
    });
  }

  // ── Payment gate ──
  const pmRows = stripeCustomerId
    ? await sql`
        SELECT stripe_payment_method_id FROM rider_payment_methods
         WHERE rider_id = ${riderId} AND is_default = true LIMIT 1
      `
    : [];
  const paymentMethodId =
    (pmRows[0] as { stripe_payment_method_id: string } | undefined)?.stripe_payment_method_id ?? null;

  if (!stripeCustomerId || !paymentMethodId) {
    return NextResponse.json(
      { error: 'PAYMENT_METHOD_REQUIRED', message: 'Add a payment method to lock in this driver' },
      { status: 412 },
    );
  }

  // ── Atomic claim: first Pull Up wins ──
  const claim = await sql`
    UPDATE hmu_posts
       SET status = 'matched'
     WHERE id = ${blastId}
       AND user_id = ${riderId}
       AND status = 'active'
       AND expires_at > NOW()
     RETURNING id
  `;
  if (!claim.length) {
    // Already matched — could be idempotent (this rider claimed it) or a race (another driver)
    const currentStatus = row.blast_status as string;
    return NextResponse.json(
      { error: 'CONFLICT', message: currentStatus === 'matched' ? 'Blast already matched' : 'Blast expired or cancelled' },
      { status: 409 },
    );
  }

  // Final price: counter → hmu_counter → blast price
  const finalPrice =
    row.counter_price != null ? Number(row.counter_price) :
    row.hmu_counter_price != null ? Number(row.hmu_counter_price) :
    Number(row.price);

  // ── Stripe: authorize + capture deposit ──
  const isMock = process.env.STRIPE_MOCK === 'true';
  let depositPiId: string | null = null;
  let paymentErr: string | null = null;

  if (!isMock) {
    try {
      const config = await getMatchingConfig('atl').catch(() => null);
      const depositPercent = config?.deposit?.percent_of_fare ?? 0.5;
      const depositMin = config?.deposit?.default_amount_cents ?? 500;
      const depositMax = config?.deposit?.max_deposit_cents ?? 5000;
      const depositCents = Math.min(
        Math.max(Math.round(finalPrice * 100 * depositPercent), depositMin),
        depositMax,
      );

      const pi = await stripe.paymentIntents.create(
        {
          amount: depositCents,
          currency: 'usd',
          customer: stripeCustomerId,
          payment_method: paymentMethodId,
          capture_method: 'manual',
          confirm: true,
          off_session: true,
          statement_descriptor_suffix: 'HMU BLAST',
          metadata: { blastId, riderId, driverId, kind: 'blast_deposit' },
        },
        { idempotencyKey: `blast_deposit_${blastId}` },
      );

      if (pi.status !== 'requires_capture') {
        try { await stripe.paymentIntents.cancel(pi.id); } catch { /* best-effort */ }
        paymentErr = `unexpected_status:${pi.status}`;
      } else {
        depositPiId = pi.id;
        // Capture immediately — rider is ready now
        await stripe.paymentIntents.capture(
          pi.id,
          {},
          { idempotencyKey: `blast_capture_${blastId}` },
        );

        await sql`
          UPDATE hmu_posts
             SET deposit_payment_intent_id = ${depositPiId},
                 deposit_amount            = ${depositCents / 100}
           WHERE id = ${blastId}
        `;
      }
    } catch (e) {
      const err = e as { code?: string; decline_code?: string; message?: string };
      if (err.code !== 'payment_intent_unexpected_state') {
        paymentErr = err.decline_code ?? err.code ?? err.message ?? 'payment_failed';
      }
    }
  }

  if (paymentErr) {
    // Roll back the claim so the rider can retry
    await sql`UPDATE hmu_posts SET status = 'active' WHERE id = ${blastId}`;
    return NextResponse.json({ error: 'PAYMENT_FAILED', message: paymentErr }, { status: 402 });
  }

  // ── Stamp winner, reject all others ──
  await sql`
    UPDATE blast_driver_targets
       SET selected_at = NOW(), pull_up_at = NOW()
     WHERE id = ${targetId}
  `;
  await sql`
    UPDATE blast_driver_targets
       SET rejected_at = NOW()
     WHERE blast_id = ${blastId}
       AND id != ${targetId}
       AND rejected_at IS NULL
       AND selected_at IS NULL
  `;

  // ── Create ride row ──
  const refCode = generateRefCode();
  const timeWindow = ((row.time_window as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const pullUpTripType = (row.trip_type as string) === 'round_trip' ? 'round_trip' : 'one_way';
  const pullUpStops = (row.stops as unknown[]) ?? [];
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
        pickup: row.pickup_address,
        dropoff: row.dropoff_address,
        tripType: pullUpTripType,
        scheduledFor: row.scheduled_for,
        timeDisplay: timeWindow.scheduledFor ?? 'ASAP',
      })}::jsonb,
      ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '5')},
      FALSE,
      ${refCode},
      ${row.pickup_address}, ${row.pickup_lat}, ${row.pickup_lng},
      ${row.dropoff_address}, ${row.dropoff_lat}, ${row.dropoff_lng},
      ${pullUpTripType}, ${JSON.stringify(pullUpStops)}::jsonb
    )
    RETURNING id
  `;
  const rideId = (rideRows[0] as { id: string }).id;

  // ── Hard schedule block (pull-up is final commitment) ──
  const blockFrom = row.scheduled_for ? new Date(row.scheduled_for as string) : new Date();
  const blockMinutes = estimateTripBlockMinutes(
    { latitude: Number(row.pickup_lat), longitude: Number(row.pickup_lng) },
    { latitude: Number(row.dropoff_lat), longitude: Number(row.dropoff_lng) },
  );
  insertScheduleBlock({
    driverId,
    blastId,
    blockType: 'hard',
    blockedFrom: blockFrom,
    blockedUntil: new Date(blockFrom.getTime() + blockMinutes * 60_000),
  }).catch((e) => console.error('[blast/pull-up] schedule block failed:', e));

  // ── Funnel event ──
  void writeBlastEvent({
    blastId,
    driverId,
    eventType: 'pull_up',
    source: 'rider_action',
    data: { rideId, finalPrice },
  });

  // ── Notify winning driver ──
  notifyUser(driverId, 'blast_match_won', {
    blastId,
    rideId,
    riderId,
    finalPrice,
    message: "You got the ride! Rider is ready — pull up now.",
    url: `/ride/${rideId}`,
  }).catch(() => {});

  // ── Notify all other HMU'd drivers (push + SMS) ──
  const losersRows = await sql`
    SELECT driver_id FROM blast_driver_targets
     WHERE blast_id = ${blastId}
       AND id != ${targetId}
       AND hmu_at IS NOT NULL
  `;
  const loserIds: string[] = [];
  for (const r of losersRows) {
    const loserId = (r as { driver_id: string }).driver_id;
    notifyUser(loserId, 'blast_taken', {
      blastId,
      message: 'Rider went with someone else on this one.',
    }).catch(() => {});
    loserIds.push(loserId);
  }
  void sendBlastTakenSms({
    driverIds: loserIds,
    pickup: row.pickup_address as string,
    dropoff: row.dropoff_address as string,
    priceDollars: finalPrice,
    marketSlug: 'atl',
  });

  // ── Broadcast on blast channel (status board + any other listeners) ──
  publishToChannel(`blast:${blastId}`, 'pull_up_started', {
    blastId, targetId, driverId, rideId,
    pullUpAt: new Date().toISOString(),
  }).catch(() => {});

  publishToChannel(`blast:${blastId}`, 'match_locked', {
    blastId, targetId, rideId, driverId, driverName, finalPrice,
  }).catch(() => {});

  return NextResponse.json({ rideId, driverId, finalPrice });
}
