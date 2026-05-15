// POST /api/blast/[id]/cancel — rider cancels a blast.
//
// Two paths, decided by whether a pull-up has happened:
//
//   PRE pull-up (blast still in matching / soft-hold phase):
//     1. Atomic UPDATE hmu_posts SET status='cancelled' WHERE status='active'
//     2. Void the deposit PaymentIntent (manual capture so cancel = release)
//     3. Release any open driver_schedule_blocks for the blast
//     4. Write 'rejected' event for every target the rider implicitly turned down
//     5. Broadcast blast_cancelled on blast:{id}
//
//   POST pull-up (rides row exists, ride state machine engaged):
//     Delegate to cascadeRideCancel({ initiator: 'rider', resolution: 'rider_pre_otw' }).
//     This is the existing canonical cancel path — see lib/rides/cancel-cascade.ts.
//     We MUST NOT reimplement; the cascade handles ride_interests, calendar release,
//     safety check-ins, ride_add_ons, and Ably fanout to all interested drivers.
//
// Non-regression: existing /api/rides/[id]/cancel/route.ts is untouched.
// cancel-cascade tests stay green.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { notifyUser } from '@/lib/ably/server';
import {
  writeBlastEvent,
  releaseScheduleBlocks,
} from '@/lib/blast/lifecycle';
import { broadcastBlastEvent } from '@/lib/blast/notify';
import {
  cascadeRideCancel,
  type CancellableRide,
} from '@/lib/rides/cancel-cascade';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  // Look up blast + check for an active ride spawned via /select.
  const blastRows = await sql`
    SELECT id, user_id, status, deposit_payment_intent_id
      FROM hmu_posts
     WHERE id = ${blastId} AND post_type = 'blast'
     LIMIT 1
  `;
  if (!blastRows.length) {
    return NextResponse.json({ error: 'Blast not found' }, { status: 404 });
  }
  const blast = blastRows[0] as {
    id: string;
    user_id: string;
    status: string;
    deposit_payment_intent_id: string | null;
  };
  if (blast.user_id !== riderId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Look for a ride spawned by this blast (via /select). If one exists and
  // isn't already cancelled, route through the canonical cascade.
  const rideRows = await sql`
    SELECT r.id, r.driver_id, r.rider_id, r.hmu_post_id, r.status,
           bdt.pull_up_at
      FROM rides r
      LEFT JOIN blast_driver_targets bdt
        ON bdt.blast_id = r.hmu_post_id
       AND bdt.driver_id = r.driver_id
     WHERE r.hmu_post_id = ${blastId}
       AND r.rider_id = ${riderId}
       AND r.status NOT IN ('cancelled', 'ended', 'refunded')
     ORDER BY r.created_at DESC
     LIMIT 1
  `;
  const ride = rideRows[0] as
    | {
        id: string;
        driver_id: string | null;
        rider_id: string | null;
        hmu_post_id: string | null;
        status: string;
        pull_up_at: string | null;
      }
    | undefined;

  // POST pull-up branch — delegate to the canonical cascade.
  if (ride && ride.pull_up_at) {
    const cancellable: CancellableRide = {
      id: ride.id,
      driver_id: ride.driver_id,
      rider_id: ride.rider_id,
      hmu_post_id: ride.hmu_post_id,
    };
    const result = await cascadeRideCancel({
      ride: cancellable,
      reason: 'Rider cancelled the blast',
      initiator: 'rider',
      resolution: 'rider_pre_otw',
    });
    void releaseScheduleBlocks({ blastId });
    if (ride.driver_id) {
      void writeBlastEvent({
        blastId,
        driverId: ride.driver_id,
        eventType: 'rejected',
        source: 'rider_action',
        data: { reason: 'rider_cancel_post_pull_up' },
      });
    }
    return NextResponse.json({
      cancelledAt: new Date().toISOString(),
      via: 'cascade',
      cascadeResult: { interestedDriverIds: result.interestedDriverIds.length },
    });
  }

  // PRE pull-up branch — atomic flip of the blast row.
  const claim = await sql`
    UPDATE hmu_posts
       SET status = 'cancelled'
     WHERE id = ${blastId}
       AND user_id = ${riderId}
       AND post_type = 'blast'
       AND status IN ('active', 'matched')
     RETURNING id, deposit_payment_intent_id
  `;
  if (!claim.length) {
    // Already cancelled, expired, or not in a cancellable state.
    return NextResponse.json({
      cancelledAt: new Date().toISOString(),
      idempotent: true,
    });
  }
  const claimed = claim[0] as { id: string; deposit_payment_intent_id: string | null };

  // If a non-pulled-up ride row was created at /select, cancel its hold + flip
  // its status so the rider's /rider/rides view doesn't show a phantom matched
  // ride. (Pull-up branch already handled rides; this catches the
  // selected-but-not-yet-pulled-up window.)
  if (ride) {
    await sql`UPDATE rides SET status = 'cancelled', cancel_resolution = 'rider_pre_otw' WHERE id = ${ride.id}`.catch(() => {});
  }

  // Release the deposit hold. Manual-capture PI → cancel = release.
  const depositPi = claimed.deposit_payment_intent_id ?? blast.deposit_payment_intent_id;
  if (depositPi && process.env.STRIPE_MOCK !== 'true') {
    try {
      await stripe.paymentIntents.cancel(
        depositPi,
        {},
        { idempotencyKey: `blast_cancel_${blastId}` },
      );
    } catch (e) {
      // Non-fatal — log only. Manual reconciliation will pick it up.
      console.error('[blast/cancel] deposit PI cancel failed:', e);
    }
  }

  void releaseScheduleBlocks({ blastId });

  // Tell the offer board to close.
  void broadcastBlastEvent(blastId, 'blast_cancelled', { blastId });

  // Tell HMU'd drivers their request is gone + write rejected events.
  const interestedRows = await sql`
    SELECT driver_id FROM blast_driver_targets
     WHERE blast_id = ${blastId}
       AND (hmu_at IS NOT NULL OR selected_at IS NOT NULL)
  `;
  for (const r of interestedRows) {
    const driverId = (r as { driver_id: string }).driver_id;
    notifyUser(driverId, 'blast_cancelled', { blastId }).catch(() => {});
    void writeBlastEvent({
      blastId,
      driverId,
      eventType: 'rejected',
      source: 'rider_action',
      data: { reason: 'rider_cancel_pre_pull_up' },
    });
  }

  return NextResponse.json({
    cancelledAt: new Date().toISOString(),
    via: 'pre_pull_up',
  });
}
