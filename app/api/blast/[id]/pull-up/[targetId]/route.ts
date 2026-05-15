// POST /api/blast/[id]/pull-up/[targetId] — rider hard-confirms.
//
// Per contract §6.6 + §8: this is the "I'm ready, driver come now" moment.
// At this point the rider has already SELECTed (soft 5min hold) — that route
// authorized the deposit and inserted a rides row. Pull-up:
//   1. Captures the authorized deposit PaymentIntent
//   2. Inserts a hard driver_schedule_blocks row (60min default)
//   3. Stamps blast_driver_targets.pull_up_at
//   4. Writes a pull_up event to the funnel log
//   5. Broadcasts pull_up_started on blast:{id}
//   6. Returns the rideId so the client routes into the existing ride flow
//
// Idempotent: a re-tap returns the prior pull_up_at without re-capturing.
// On failure to capture, pull_up_at stays NULL and the rider can retry.
//
// Reuses Stripe via the existing connect.ts client and the deposit PI written
// at /select. Does NOT create a new PaymentIntent — that already happened.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { writeBlastEvent, insertScheduleBlock } from '@/lib/blast/lifecycle';
import { broadcastBlastEvent } from '@/lib/blast/notify';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
): Promise<Response> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  // Pull blast + selected target. Must own the blast and have selected this
  // target via the prior /select call.
  const targetRows = await sql`
    SELECT bdt.id AS target_id, bdt.driver_id, bdt.selected_at, bdt.pull_up_at,
           bdt.counter_price, bdt.hmu_counter_price,
           p.id AS blast_id, p.user_id AS rider_id, p.deposit_payment_intent_id,
           p.deposit_amount, p.price
      FROM blast_driver_targets bdt
      JOIN hmu_posts p ON p.id = bdt.blast_id
     WHERE bdt.id = ${targetId}
       AND p.id = ${blastId}
       AND p.post_type = 'blast'
     LIMIT 1
  `;
  if (!targetRows.length) {
    return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  }
  const target = targetRows[0] as {
    target_id: string;
    driver_id: string;
    selected_at: string | null;
    pull_up_at: string | null;
    counter_price: string | null;
    hmu_counter_price: string | null;
    blast_id: string;
    rider_id: string;
    deposit_payment_intent_id: string | null;
    deposit_amount: string | null;
    price: string;
  };

  if (target.rider_id !== riderId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!target.selected_at) {
    return NextResponse.json(
      { error: 'NOT_SELECTED', message: 'Select this driver before pulling up' },
      { status: 400 },
    );
  }

  // Find the ride row select created. We use this for both the response and
  // the schedule block linkage.
  const rideRows = await sql`
    SELECT id, payment_intent_id
      FROM rides
     WHERE hmu_post_id = ${blastId}
       AND driver_id = ${target.driver_id}
       AND rider_id = ${riderId}
     ORDER BY created_at DESC
     LIMIT 1
  `;
  const ride = rideRows[0] as { id: string; payment_intent_id: string | null } | undefined;

  // Idempotent: second tap returns existing pull_up_at without re-capturing.
  if (target.pull_up_at) {
    return NextResponse.json({
      pullUpAt: target.pull_up_at,
      paymentIntentId: target.deposit_payment_intent_id,
      rideId: ride?.id ?? null,
      idempotent: true,
    });
  }

  // Capture the deposit. Handles two cases:
  //   1. Deposit PI on the platform account (no stripeAccount option needed)
  //   2. Mock mode (STRIPE_MOCK=true) — skip the API call
  const isMock = process.env.STRIPE_MOCK === 'true';
  let captureErr: string | null = null;
  if (!isMock && target.deposit_payment_intent_id) {
    try {
      await stripe.paymentIntents.capture(
        target.deposit_payment_intent_id,
        {},
        { idempotencyKey: `blast_pullup_${blastId}_${targetId}` },
      );
    } catch (e) {
      const err = e as { code?: string; message?: string };
      // 'invalid_state' on a PI that's already captured — treat as success.
      if (err.code === 'payment_intent_unexpected_state') {
        // Already captured by another path — proceed.
      } else {
        captureErr = err.code ?? err.message ?? 'capture_failed';
      }
    }
  }

  if (captureErr) {
    return NextResponse.json(
      { error: 'CAPTURE_FAILED', message: captureErr },
      { status: 402 },
    );
  }

  // Stamp pull_up_at + insert hard schedule block + write event in parallel.
  // The hard block defaults to 60min from now (covers a typical ride).
  const pulledRows = await sql`
    UPDATE blast_driver_targets
       SET pull_up_at = NOW()
     WHERE id = ${targetId} AND pull_up_at IS NULL
     RETURNING pull_up_at
  `;
  const pullUpAt = pulledRows.length
    ? (pulledRows[0] as { pull_up_at: string }).pull_up_at
    : new Date().toISOString();

  // Best-effort: don't fail the response on a schedule-block insert hiccup.
  insertScheduleBlock({
    driverId: target.driver_id,
    blastId,
    blockType: 'hard',
  }).catch((e) => console.error('[blast/pull-up] schedule block insert failed:', e));

  const finalPrice = target.counter_price !== null
    ? Number(target.counter_price)
    : target.hmu_counter_price !== null
      ? Number(target.hmu_counter_price)
      : Number(target.price);

  void writeBlastEvent({
    blastId,
    driverId: target.driver_id,
    eventType: 'pull_up',
    source: 'rider_action',
    data: { rideId: ride?.id ?? null, finalPrice },
  });

  void broadcastBlastEvent(blastId, 'pull_up_started', {
    blastId,
    targetId,
    driverId: target.driver_id,
    rideId: ride?.id ?? null,
    pullUpAt,
  });

  return NextResponse.json({
    pullUpAt,
    paymentIntentId: target.deposit_payment_intent_id,
    rideId: ride?.id ?? null,
  });
}
