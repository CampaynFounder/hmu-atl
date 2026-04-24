import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { cancelPaymentHold, partialCaptureDeposit } from '@/lib/payments/escrow';
import { getHoldPolicy, calculateCancelSplit } from '@/lib/payments/hold-policy';
import { cascadeRideCancel, type CancellableRide } from '@/lib/rides/cancel-cascade';

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

    const cancellable: CancellableRide = {
      id: rideId,
      driver_id: ride.driver_id as string | null,
      rider_id: ride.rider_id as string | null,
      hmu_post_id: (ride.hmu_post_id as string | null) ?? null,
    };

    // Rider can cancel freely before OTW.
    if (isRider && ['matched'].includes(status)) {
      cancelPaymentHold(rideId, 'Rider cancelled before OTW').catch(e =>
        console.error('Hold release failed:', e),
      );
      await cascadeRideCancel({
        ride: cancellable,
        reason: 'Rider cancelled the ride',
        initiator: 'rider',
      });
      return NextResponse.json({ status: 'cancelled', penaltyFree: true });
    }

    // Rider requests cancellation after OTW — needs driver agreement.
    // No cascade yet; ride stays 'otw'/'here' until driver agrees below.
    if (isRider && ['otw', 'here'].includes(status)) {
      await sql`UPDATE rides SET updated_at = NOW() WHERE id = ${rideId}`;

      await publishRideUpdate(rideId, 'cancel_request', {
        requestedBy: 'rider',
        reason: reason || 'Rider wants to cancel',
        message: 'Rider is requesting to cancel — do you agree?',
      }).catch(() => {});
      await notifyUser(ride.driver_id as string, 'ride_update', {
        rideId, status: 'cancel_requested',
        message: 'Rider wants to cancel. Agree?',
      }).catch(() => {});

      return NextResponse.json({ status: 'cancel_requested', needsDriverApproval: true });
    }

    // Driver agrees to cancel (rider initiated).
    if (isDriver && body.agreeToCancel) {
      if (!['matched', 'otw', 'here'].includes(status)) {
        return NextResponse.json({ error: 'Cannot cancel at this stage' }, { status: 400 });
      }

      const wasAfterOtw = ['otw', 'here'].includes(status);
      const visibleDeposit = Number(ride.visible_deposit ?? ride.final_agreed_price ?? 0);
      let cancelSplit: ReturnType<typeof calculateCancelSplit> | null = null;

      if (wasAfterOtw && visibleDeposit > 0) {
        // After OTW: apply hold policy split — driver gets their share of the deposit.
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
        extra: cancelSplit ? { cancelSplit } : {},
      });

      return NextResponse.json({ status: 'cancelled', cancelSplit });
    }

    // Driver can cancel freely before OTW.
    if (isDriver && ['matched'].includes(status)) {
      cancelPaymentHold(rideId, 'Driver cancelled before OTW').catch(e =>
        console.error('Hold release failed:', e),
      );
      await cascadeRideCancel({
        ride: cancellable,
        reason: 'Driver cancelled the ride',
        initiator: 'driver',
      });
      return NextResponse.json({ status: 'cancelled', penaltyFree: true });
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
