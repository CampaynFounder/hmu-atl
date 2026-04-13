import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { cancelPaymentHold, partialCaptureDeposit } from '@/lib/payments/escrow';
import { cancelRideBooking } from '@/lib/schedule/conflicts';
import { getHoldPolicy, calculateCancelSplit } from '@/lib/payments/hold-policy';

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

    // Rider can cancel freely before OTW
    if (isRider && ['matched'].includes(status)) {
      await sql`UPDATE rides SET status = 'cancelled', updated_at = NOW() WHERE id = ${rideId}`;

      // Release Stripe hold if payment was authorized
      cancelPaymentHold(rideId, 'Rider cancelled before OTW').catch(e => console.error('Hold release failed:', e));
      cancelRideBooking(rideId).catch(() => {});

      // Reactivate the original post so other drivers can accept
      if (ride.hmu_post_id) {
        await sql`
          UPDATE hmu_posts SET status = 'active', expires_at = NOW() + INTERVAL '2 hours'
          WHERE id = ${ride.hmu_post_id}
        `;
      }

      await publishRideUpdate(rideId, 'status_change', { status: 'cancelled', message: 'Rider cancelled the ride' }).catch(() => {});
      await notifyUser(ride.driver_id as string, 'ride_update', {
        rideId, status: 'cancelled', message: 'Rider cancelled the ride',
      }).catch(() => {});

      return NextResponse.json({ status: 'cancelled', penaltyFree: true });
    }

    // Rider requests cancellation after OTW — needs driver agreement
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

    // Driver agrees to cancel
    if (isDriver && body.agreeToCancel) {
      if (!['matched', 'otw', 'here'].includes(status)) {
        return NextResponse.json({ error: 'Cannot cancel at this stage' }, { status: 400 });
      }

      const wasAfterOtw = ['otw', 'here'].includes(status);
      const visibleDeposit = Number(ride.visible_deposit ?? ride.final_agreed_price ?? 0);

      if (wasAfterOtw && visibleDeposit > 0) {
        // After OTW: apply hold policy split — driver gets their share of the deposit
        const driverTierRows = await sql`SELECT tier FROM users WHERE id = ${ride.driver_id} LIMIT 1`;
        const driverTier = ((driverTierRows[0] as Record<string, unknown>)?.tier as string) || 'free';
        const holdPolicy = await getHoldPolicy(driverTier);
        const split = calculateCancelSplit(visibleDeposit, 'after_otw', holdPolicy);

        if (split.riderCharged > 0) {
          // Partial capture of the deposit amount
          await partialCaptureDeposit(rideId, split.driverReceives, split.platformReceives).catch(e =>
            console.error('Deposit capture failed on cancel:', e)
          );
        } else {
          await cancelPaymentHold(rideId, 'Cancelled by agreement — no charge').catch(e =>
            console.error('Hold release failed:', e)
          );
        }

        await sql`UPDATE rides SET status = 'cancelled', updated_at = NOW() WHERE id = ${rideId}`;
        cancelRideBooking(rideId).catch(() => {});

        if (ride.hmu_post_id) {
          await sql`
            UPDATE hmu_posts SET status = 'active', expires_at = NOW() + INTERVAL '2 hours'
            WHERE id = ${ride.hmu_post_id}
          `;
        }

        const msg = split.driverReceives > 0
          ? `Cancelled after OTW. Driver gets $${split.driverReceives.toFixed(2)} (gas compensation from deposit).`
          : 'Ride cancelled by agreement — no charge.';

        await publishRideUpdate(rideId, 'status_change', { status: 'cancelled', message: msg, cancelSplit: split }).catch(() => {});
        await notifyUser(ride.rider_id as string, 'ride_update', {
          rideId, status: 'cancelled', message: msg,
        }).catch(() => {});

        return NextResponse.json({ status: 'cancelled', cancelSplit: split });
      }

      // Before OTW or no deposit: full release
      await sql`UPDATE rides SET status = 'cancelled', updated_at = NOW() WHERE id = ${rideId}`;
      cancelPaymentHold(rideId, 'Cancelled by agreement').catch(e => console.error('Hold release failed:', e));
      cancelRideBooking(rideId).catch(() => {});

      if (ride.hmu_post_id) {
        await sql`
          UPDATE hmu_posts SET status = 'active', expires_at = NOW() + INTERVAL '2 hours'
          WHERE id = ${ride.hmu_post_id}
        `;
      }

      await publishRideUpdate(rideId, 'status_change', { status: 'cancelled', message: 'Ride cancelled by agreement' }).catch(() => {});
      await notifyUser(ride.rider_id as string, 'ride_update', {
        rideId, status: 'cancelled', message: 'Driver agreed to cancel',
      }).catch(() => {});

      return NextResponse.json({ status: 'cancelled' });
    }

    // Driver can cancel freely before OTW
    if (isDriver && ['matched'].includes(status)) {
      await sql`UPDATE rides SET status = 'cancelled', updated_at = NOW() WHERE id = ${rideId}`;

      // Release Stripe hold if payment was authorized
      cancelPaymentHold(rideId, 'Driver cancelled before OTW').catch(e => console.error('Hold release failed:', e));
      cancelRideBooking(rideId).catch(() => {});

      if (ride.hmu_post_id) {
        await sql`
          UPDATE hmu_posts SET status = 'active', expires_at = NOW() + INTERVAL '2 hours'
          WHERE id = ${ride.hmu_post_id}
        `;
      }

      await publishRideUpdate(rideId, 'status_change', { status: 'cancelled', message: 'Driver cancelled' }).catch(() => {});
      await notifyUser(ride.rider_id as string, 'ride_update', {
        rideId, status: 'cancelled', message: 'Driver cancelled the ride',
      }).catch(() => {});

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
