import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { captureRiderPayment } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can end the ride' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'ended')) {
      return NextResponse.json({ error: `Cannot end ride from status: ${ride.status}` }, { status: 400 });
    }

    const disputeMinutes = Number(ride.dispute_window_minutes || process.env.DISPUTE_WINDOW_MINUTES || 15);

    // Capture payment
    let payoutResult = { driverReceives: 0, platformReceives: 0, capHit: false };
    if (ride.payment_intent_id && ride.funds_held) {
      try {
        payoutResult = await captureRiderPayment(rideId);
      } catch (e) {
        console.error('Payment capture failed:', e);
      }
    }

    await sql`
      UPDATE rides SET
        status = 'ended',
        ended_at = NOW(),
        driver_confirmed_end = true,
        dispute_window_expires_at = NOW() + ${disputeMinutes + ' minutes'}::interval,
        rider_auto_rated = true,
        rider_rating = 'chill',
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'active'
    `;

    await publishRideUpdate(rideId, 'status_change', {
      status: 'ended',
      message: 'Ride ended',
      driverReceives: payoutResult.driverReceives,
      disputeWindowMinutes: disputeMinutes,
    }).catch(() => {});
    await notifyUser(ride.rider_id as string, 'ride_update', {
      rideId, status: 'ended', message: 'Ride complete — rate your driver',
    }).catch(() => {});

    return NextResponse.json({
      status: 'ended',
      rideId,
      disputeWindowMinutes: disputeMinutes,
      driverReceives: payoutResult.driverReceives,
      platformFee: payoutResult.platformReceives,
      capHit: payoutResult.capHit,
    });
  } catch (error) {
    console.error('End ride error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
