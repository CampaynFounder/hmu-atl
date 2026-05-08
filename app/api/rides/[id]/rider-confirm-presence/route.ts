// POST /api/rides/[id]/rider-confirm-presence
//
// Rider taps "I'm In" on their screen at status 'here' to confirm they're
// physically in the driver's car. This is the new mandatory gate before the
// driver can tap Start Ride. If platform_config 'payments.captureTrigger'
// is 'rider_confirm', this endpoint also fires the Stripe capture; otherwise
// capture stays on the driver's Start Ride tap.
//
// Idempotent — re-tapping I'm In after the first confirmation is a no-op.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { captureRiderPayment } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { getPlatformConfig } from '@/lib/platform-config/get';

const CAPTURE_TRIGGER_KEY = 'payments.captureTrigger';
const CAPTURE_TRIGGER_DEFAULTS = { trigger: 'driver_start_ride' as 'rider_confirm' | 'driver_start_ride' };

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
    try {
      const body = await req.json();
      riderLat = body.lat ?? body.riderLat ?? null;
      riderLng = body.lng ?? body.riderLng ?? null;
    } catch { /* no body is ok */ }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    // Only the rider can confirm presence
    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can confirm presence' }, { status: 403 });
    }

    // Must be at HERE for the new flow. Anything past 'here' (confirming /
    // active) is a no-op — already past this gate.
    if (ride.status !== 'here') {
      // Idempotent — if rider re-taps after status moves on, treat as success.
      if (ride.rider_in_car_confirmed_at) {
        return NextResponse.json({
          status: ride.status,
          rideId,
          riderInCarConfirmedAt: ride.rider_in_car_confirmed_at,
          alreadyConfirmed: true,
        });
      }
      return NextResponse.json(
        { error: `Cannot confirm presence from status: ${ride.status}` },
        { status: 400 },
      );
    }

    // Idempotent: if already confirmed, return cached state without re-capturing.
    if (ride.rider_in_car_confirmed_at) {
      return NextResponse.json({
        status: ride.status,
        rideId,
        riderInCarConfirmedAt: ride.rider_in_car_confirmed_at,
        alreadyConfirmed: true,
      });
    }

    const captureCfg = await getPlatformConfig(CAPTURE_TRIGGER_KEY, CAPTURE_TRIGGER_DEFAULTS);
    const shouldCaptureNow =
      captureCfg.trigger === 'rider_confirm' &&
      !ride.is_cash &&
      !ride.payment_captured &&
      ride.payment_intent_id &&
      ride.funds_held;

    let captureResult: { driverReceives: number; platformReceives: number; capHit: boolean; waivedFee: number; offerActive: boolean } | null = null;
    if (shouldCaptureNow) {
      captureResult = await captureRiderPayment(rideId);
    }

    await sql`
      UPDATE rides SET
        rider_in_car_confirmed_at = NOW(),
        rider_start_lat = COALESCE(rider_start_lat, ${riderLat}),
        rider_start_lng = COALESCE(rider_start_lng, ${riderLng}),
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'here' AND rider_in_car_confirmed_at IS NULL
    `;

    // Tell the driver client to enable Start Ride.
    await publishRideUpdate(rideId, 'rider_confirmed_presence', {
      status: 'here',
      riderInCarConfirmedAt: new Date().toISOString(),
      captured: !!captureResult,
      message: 'Rider confirmed they\'re in the car — Start Ride is live',
    }).catch(() => {});

    await notifyUser(ride.driver_id as string, 'ride_update', {
      rideId,
      status: 'here',
      riderInCarConfirmedAt: new Date().toISOString(),
      message: 'Rider says they\'re in the car — tap Start Ride',
    }).catch(() => {});

    return NextResponse.json({
      status: 'here',
      rideId,
      riderInCarConfirmedAt: new Date().toISOString(),
      captured: !!captureResult,
      driverReceives: captureResult?.driverReceives ?? 0,
      platformFee: captureResult?.platformReceives ?? 0,
      captureTrigger: captureCfg.trigger,
    });
  } catch (error) {
    console.error('Rider confirm-presence error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
