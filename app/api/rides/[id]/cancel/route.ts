// Ride cancellation endpoint.
//
// Branches:
//   1. Rider cancels at status='matched'             → free, immediate cascade
//   2. Driver cancels at status='matched'            → free, immediate cascade
//   3. Rider requests cancel at status IN (otw,here) → stamps cancel_requested_at,
//                                                      driver banner shows
//                                                      countdown. Resolution
//                                                      happens via:
//                                                        a. driver agrees → this route, body.agreeToCancel
//                                                        b. driver declines → /api/rides/[id]/cancel-request/decline
//                                                        c. timeout → /api/rides/[id]/cancel-request/timeout
//
// Money rules per branch:
//   matched cancel (1, 2):    full hold release, no charge to rider, nothing to driver
//   driver agrees (3a):       hold-policy split (default driver gets 100% gas comp)
//   driver declines (3b):     handled in /cancel-request/decline endpoint
//   timeout (3c):             handled in /cancel-request/timeout endpoint
//
// Money rules outside this route are unchanged. Capture timing for active
// rides is governed by money_movement_canonical / deposit_only_launch_model.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { cancelPaymentHold, partialCaptureDeposit } from '@/lib/payments/escrow';
import { getHoldPolicy, calculateCancelSplit } from '@/lib/payments/hold-policy';
import { cascadeRideCancel, type CancellableRide } from '@/lib/rides/cancel-cascade';
import { getPlatformConfig } from '@/lib/platform-config/get';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json().catch(() => ({}));
    const { reason } = body as { reason?: string };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);
    const isRider = ride.rider_id === userId;
    const isDriver = ride.driver_id === userId;
    const status = ride.status as string;

    // Already cancelled (concurrent tap, refresh-after-success). Idempotent
    // success — caller's UI already redirects on the cascaded status_change
    // event so we just confirm.
    if (status === 'cancelled') {
      return NextResponse.json({
        status: 'cancelled',
        idempotent: true,
        resolution: ride.cancel_resolution as string | null,
      });
    }

    const cancellable: CancellableRide = {
      id: rideId,
      driver_id: ride.driver_id as string | null,
      rider_id: ride.rider_id as string | null,
      hmu_post_id: (ride.hmu_post_id as string | null) ?? null,
    };

    // Branch 1 — Rider cancels at matched (pre-OTW). Penalty free.
    if (isRider && status === 'matched') {
      cancelPaymentHold(rideId, 'Rider cancelled before OTW').catch(e =>
        console.error('Hold release failed:', e),
      );
      await cascadeRideCancel({
        ride: cancellable,
        reason: reason || 'Rider cancelled the ride',
        initiator: 'rider',
        resolution: 'rider_pre_otw',
      });
      return NextResponse.json({ status: 'cancelled', penaltyFree: true, resolution: 'rider_pre_otw' });
    }

    // Branch 2 — Driver cancels at matched (pre-OTW). Penalty free.
    if (isDriver && status === 'matched' && !body.agreeToCancel) {
      cancelPaymentHold(rideId, 'Driver cancelled before OTW').catch(e =>
        console.error('Hold release failed:', e),
      );
      await cascadeRideCancel({
        ride: cancellable,
        reason: reason || 'Driver cancelled the ride',
        initiator: 'driver',
        resolution: 'driver_pre_otw',
      });
      return NextResponse.json({ status: 'cancelled', penaltyFree: true, resolution: 'driver_pre_otw' });
    }

    // Branch 3 — Rider requests cancel after OTW. No cascade yet; stamp
    // cancel_requested_at + cancel_requested_by so:
    //   • the driver's UI can render a countdown
    //   • the cron backstop can pick it up if both clients went silent
    //   • the timeout endpoint can validate the request is actually stale
    // The ride stays at otw/here. Resolution happens in 3a / 3b / 3c.
    if (isRider && ['otw', 'here'].includes(status)) {
      // Idempotent on repeat — if the rider tapped twice, surface the
      // existing request rather than overwriting cancel_requested_at (which
      // would reset the timeout window from under the driver).
      if (ride.cancel_requested_at && !ride.cancel_resolution) {
        return NextResponse.json({
          status: 'cancel_requested',
          needsDriverApproval: true,
          requestedAt: ride.cancel_requested_at,
          alreadyRequested: true,
        });
      }

      const cancelReason = reason || 'Rider wants to cancel';
      const updateRows = (await sql`
        UPDATE rides
        SET cancel_requested_at = NOW(),
            cancel_requested_by = 'rider',
            cancel_request_reason = ${cancelReason},
            updated_at = NOW()
        WHERE id = ${rideId}
          AND status IN ('otw', 'here')
          AND cancel_requested_at IS NULL
        RETURNING cancel_requested_at
      `) as Array<{ cancel_requested_at: Date }>;

      if (!updateRows.length) {
        // Lost the race to another tab/double-tap — re-read and surface
        // whatever's there.
        const fresh = await getRideForUser(rideId, userId);
        return NextResponse.json({
          status: fresh.status === 'cancelled' ? 'cancelled' : 'cancel_requested',
          needsDriverApproval: fresh.status !== 'cancelled',
          requestedAt: fresh.cancel_requested_at as Date | null,
          alreadyRequested: true,
        });
      }

      const requestedAt = updateRows[0].cancel_requested_at;
      const cfg = await getPlatformConfig('cancellation.request_timeout_seconds', { value: 180 });
      const timeoutSeconds = Number(cfg.value) || 180;

      const driverPayload = {
        rideId,
        status: 'cancel_requested',
        requestedBy: 'rider',
        reason: cancelReason,
        requestedAt,
        timeoutSeconds,
        message: 'Rider is requesting to cancel — do you agree?',
      };

      // Both sides need this realtime so the rider's "waiting for driver"
      // UI can render with the same timeout the driver sees, keeping their
      // countdowns in lock-step.
      await Promise.all([
        publishRideUpdate(rideId, 'cancel_request', driverPayload).catch(() => {}),
        notifyUser(ride.driver_id as string, 'ride_update', driverPayload).catch(() => {}),
        ride.rider_id ? notifyUser(ride.rider_id as string, 'ride_update', driverPayload).catch(() => {}) : Promise.resolve(),
      ]);

      return NextResponse.json({
        status: 'cancel_requested',
        needsDriverApproval: true,
        requestedAt,
        timeoutSeconds,
      });
    }

    // Branch 3a — Driver agrees to a rider-requested cancel. Mutual cancel
    // with hold-policy split. Driver's choice to keep the deposit lives in
    // the /cancel-request/decline endpoint — not here.
    if (isDriver && body.agreeToCancel) {
      if (!['otw', 'here', 'matched'].includes(status)) {
        return NextResponse.json({ error: 'Cannot cancel at this stage' }, { status: 400 });
      }

      const wasAfterOtw = ['otw', 'here'].includes(status);
      const visibleDeposit = Number(ride.visible_deposit ?? ride.final_agreed_price ?? 0);
      let cancelSplit: ReturnType<typeof calculateCancelSplit> | null = null;

      if (wasAfterOtw && visibleDeposit > 0) {
        const driverTierRows = await sql`SELECT tier FROM users WHERE id = ${ride.driver_id} LIMIT 1`;
        const driverTier = ((driverTierRows[0] as Record<string, unknown>)?.tier as string) || 'free';
        const holdPolicy = await getHoldPolicy(driverTier);
        cancelSplit = calculateCancelSplit(visibleDeposit, 'after_otw', holdPolicy);

        if (cancelSplit.riderCharged > 0) {
          await partialCaptureDeposit(rideId, cancelSplit.driverReceives, cancelSplit.platformReceives).catch(e =>
            console.error('Deposit capture failed on cancel:', e),
          );
        } else {
          cancelPaymentHold(rideId, 'Cancelled by agreement — no charge').catch(e =>
            console.error('Hold release failed:', e),
          );
        }
      } else {
        cancelPaymentHold(rideId, 'Cancelled by agreement').catch(e =>
          console.error('Hold release failed:', e),
        );
      }

      const msg = cancelSplit && cancelSplit.driverReceives > 0
        ? `Cancelled after OTW. Driver gets $${cancelSplit.driverReceives.toFixed(2)} (gas compensation from deposit).`
        : 'Ride cancelled by agreement — no charge.';

      await cascadeRideCancel({
        ride: cancellable,
        reason: msg,
        initiator: 'mutual',
        resolution: 'mutual_agreed',
        extra: cancelSplit ? { cancelSplit } : {},
      });

      return NextResponse.json({ status: 'cancelled', cancelSplit, resolution: 'mutual_agreed' });
    }

    return NextResponse.json({ error: 'Cannot cancel at this stage' }, { status: 400 });
  } catch (error) {
    console.error('Cancel error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel' },
      { status: 500 }
    );
  }
}
