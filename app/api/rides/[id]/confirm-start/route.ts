import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { captureRiderPayment } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { syncBookingFromRide } from '@/lib/schedule/conflicts';

/**
 * Rider confirms they're in the car → capture payment → ride active.
 * Called after driver taps "Start Ride" and ride is in "confirming" status.
 * Also handles auto-confirm (2 min timeout triggers this from client).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    let riderLat: number | null = null;
    let riderLng: number | null = null;
    let autoConfirmed = false;
    try {
      const body = await req.json();
      riderLat = body.lat ?? body.riderLat ?? null;
      riderLng = body.lng ?? body.riderLng ?? null;
      autoConfirmed = body.autoConfirmed ?? false;
    } catch { /* no body is ok */ }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    // Only the rider can confirm start
    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can confirm ride start' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'active')) {
      return NextResponse.json({ error: `Cannot confirm from status: ${ride.status}` }, { status: 400 });
    }

    // Idempotency: if already captured, don't capture again
    if (ride.payment_captured) {
      return NextResponse.json({ status: 'active', rideId, alreadyCaptured: true });
    }

    // Capture payment (digital rides only)
    let captureResult = { driverReceives: 0, platformReceives: 0, capHit: false, waivedFee: 0, offerActive: false, offerProgress: null as unknown, offerJustExhausted: false };
    const isCashRide = !!(ride.is_cash);

    if (!isCashRide && ride.payment_intent_id && ride.funds_held) {
      // Generate idempotency key for this capture
      const idempotencyKey = `capture_${rideId}_${Date.now()}`;
      await sql`UPDATE rides SET capture_idempotency_key = ${idempotencyKey} WHERE id = ${rideId} AND capture_idempotency_key IS NULL`;

      captureResult = await captureRiderPayment(rideId);
    }

    // Transition to active
    await sql`
      UPDATE rides SET
        status = 'active',
        started_at = COALESCE(started_at, NOW()),
        rider_confirmed_start = true,
        rider_start_lat = ${riderLat},
        rider_start_lng = ${riderLng},
        auto_confirmed = ${autoConfirmed},
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'confirming'
    `;

    syncBookingFromRide(rideId, 'active').catch(() => {});

    // Notify both parties
    await publishRideUpdate(rideId, 'status_change', {
      status: 'active',
      message: autoConfirmed ? 'Ride auto-started' : 'Rider confirmed — ride is active',
      captured: !isCashRide,
      driverReceives: captureResult.driverReceives,
    }).catch(() => {});

    await notifyUser(ride.driver_id as string, 'ride_update', {
      rideId,
      status: 'active',
      message: autoConfirmed ? 'Ride auto-started — let\'s go!' : 'Rider confirmed — ride is active!',
    }).catch(() => {});

    return NextResponse.json({
      status: 'active',
      rideId,
      captured: !isCashRide,
      autoConfirmed,
      driverReceives: captureResult.driverReceives,
      platformFee: captureResult.platformReceives,
      capHit: captureResult.capHit,
      waivedFee: captureResult.waivedFee,
      offerActive: captureResult.offerActive,
    });
  } catch (error) {
    console.error('Confirm start error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm ride start' },
      { status: 500 }
    );
  }
}
