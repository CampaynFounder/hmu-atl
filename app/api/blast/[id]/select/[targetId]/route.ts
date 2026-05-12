// POST /api/blast/[id]/select/[targetId] — rider locks the match.
//
// Race-safe: an atomic UPDATE … WHERE status='active' RETURNING id ensures only
// the first call wins. Subsequent calls (or races) get 409.
//
// On success:
//   - hmu_posts.status → 'matched'
//   - blast_driver_targets: this row gets selected_at; other rows get rejected_at
//   - rides row created (status='matched')
//   - blast deposit PaymentIntent is RELEASED here — the normal Pull Up flow
//     takes over and runs its own holdRiderPayment with the actual driver as
//     transfer_data.destination. The blast deposit was just a commitment hold.
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

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

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
     RETURNING id, price, deposit_payment_intent_id, pickup_address, dropoff_address,
               pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
               scheduled_for, trip_type, areas, time_window
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

  // Release the blast deposit hold — it served its purpose. The normal Pull Up
  // flow will create its own PaymentIntent against the matched driver's
  // Connect account when the rider hits Pull Up at HERE.
  const blastPi = post.deposit_payment_intent_id as string | null;
  if (blastPi) {
    try {
      await stripe.paymentIntents.cancel(
        blastPi,
        {},
        { idempotencyKey: `blast_release_${blastId}` },
      );
    } catch (e) {
      // Non-fatal: the PI may already be cancelled or in an end state.
      console.error('[blast] release deposit failed:', e);
    }
  }

  // Create the ride row. Mirror the shape used by /api/bookings/[postId]/accept.
  const refCode = generateRefCode();
  const timeWindow = (post.time_window as Record<string, unknown>) ?? {};
  const rideRows = await sql`
    INSERT INTO rides (
      driver_id, rider_id, status, amount, final_agreed_price,
      price_mode, price_accepted_at,
      hmu_post_id, agreement_summary,
      dispute_window_minutes, is_cash, ref_code,
      pickup_address, pickup_lat, pickup_lng,
      dropoff_address, dropoff_lat, dropoff_lng
    ) VALUES (
      ${driverId}, ${riderId}, 'matched', ${finalPrice}, ${finalPrice},
      'proposed', NOW(),
      ${blastId},
      ${JSON.stringify({
        source: 'blast',
        pickup: post.pickup_address,
        dropoff: post.dropoff_address,
        tripType: post.trip_type,
        scheduledFor: post.scheduled_for,
        timeDisplay: timeWindow.scheduledFor ?? 'ASAP',
      })}::jsonb,
      ${parseInt(process.env.DISPUTE_WINDOW_MINUTES || '5')},
      FALSE,
      ${refCode},
      ${post.pickup_address}, ${post.pickup_lat}, ${post.pickup_lng},
      ${post.dropoff_address}, ${post.dropoff_lat}, ${post.dropoff_lng}
    )
    RETURNING id, ref_code
  `;
  const rideId = (rideRows[0] as { id: string }).id;

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

  // Notify losers.
  const loserRows = await sql`
    SELECT driver_id FROM blast_driver_targets
    WHERE blast_id = ${blastId} AND id != ${targetId}
  `;
  for (const r of loserRows) {
    const losDriverId = (r as { driver_id: string }).driver_id;
    notifyUser(losDriverId, 'blast_taken', { blastId }).catch(() => {});
  }

  return NextResponse.json({ rideId, refCode, driverId, finalPrice });
}
