import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { captureRiderPayment } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { syncBookingFromRide } from '@/lib/schedule/conflicts';
import { getPlatformConfig } from '@/lib/platform-config/get';

// Haversine distance in meters
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PROXIMITY_THRESHOLD_M = 100;
const CAPTURE_TRIGGER_KEY = 'payments.captureTrigger';
const CAPTURE_TRIGGER_DEFAULTS = { trigger: 'driver_start_ride' as 'rider_confirm' | 'driver_start_ride' };

/**
 * Driver taps "Start Ride" from HERE status. Gated on the rider having
 * tapped "I'm In" first (rider_in_car_confirmed_at IS NOT NULL). Goes
 * directly to 'active'; if platform_config.payments.captureTrigger is
 * 'driver_start_ride' (default), capture fires here. If it's
 * 'rider_confirm', capture already fired when the rider confirmed and
 * this route is purely a status transition.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    let driverLat: number | null = null;
    let driverLng: number | null = null;
    try {
      const body = await req.json();
      driverLat = body.driverLat ?? body.lat ?? null;
      driverLng = body.driverLng ?? body.lng ?? null;
    } catch { /* no body is ok */ }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can start the ride' }, { status: 403 });
    }

    if (ride.status !== 'here') {
      return NextResponse.json({ error: `Cannot start ride from status: ${ride.status}` }, { status: 400 });
    }

    // Gate: rider must have tapped "I'm In" first.
    if (!ride.rider_in_car_confirmed_at) {
      return NextResponse.json(
        {
          error: 'Waiting for rider to confirm they\'re in the car',
          code: 'rider_not_confirmed',
        },
        { status: 400 },
      );
    }

    if (!validateTransition(ride.status as string, 'active')) {
      return NextResponse.json({ error: `Invalid transition from ${ride.status} to active` }, { status: 400 });
    }

    // Proximity check — advisory, surfaced for analytics but not blocking
    let proximityOk: boolean | null = null;
    let distanceM: number | null = null;
    const riderLat = Number(ride.rider_start_lat || ride.pickup_lat) || null;
    const riderLng = Number(ride.rider_start_lng || ride.pickup_lng) || null;
    if (driverLat && driverLng && riderLat && riderLng) {
      distanceM = haversineMeters(driverLat, driverLng, riderLat, riderLng);
      proximityOk = distanceM <= PROXIMITY_THRESHOLD_M;
    }

    // Decide whether to capture now. If trigger is rider_confirm, the rider's
    // earlier tap already captured (or it's a cash ride / already-captured).
    const captureCfg = await getPlatformConfig(CAPTURE_TRIGGER_KEY, CAPTURE_TRIGGER_DEFAULTS);
    const shouldCaptureNow =
      captureCfg.trigger === 'driver_start_ride' &&
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
        status = 'active',
        started_at = COALESCE(started_at, NOW()),
        driver_start_lat = ${driverLat},
        driver_start_lng = ${driverLng},
        proximity_check_m = ${distanceM},
        rider_confirmed_start = TRUE,
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'here'
    `;

    syncBookingFromRide(rideId, 'active').catch(() => {});

    await publishRideUpdate(rideId, 'status_change', {
      status: 'active',
      proximityOk,
      distanceM,
      captured: !!captureResult || ride.payment_captured,
      message: 'Ride is active',
    }).catch(() => {});

    await notifyUser(ride.rider_id as string, 'ride_update', {
      rideId,
      status: 'active',
      message: 'Ride started — let\'s go!',
    }).catch(() => {});

    return NextResponse.json({
      status: 'active',
      rideId,
      proximityOk,
      distanceM: distanceM ? Math.round(distanceM) : null,
      captured: !!captureResult || ride.payment_captured,
      driverReceives: captureResult?.driverReceives ?? 0,
      platformFee: captureResult?.platformReceives ?? 0,
      capHit: captureResult?.capHit ?? false,
      waivedFee: captureResult?.waivedFee ?? 0,
      captureTrigger: captureCfg.trigger,
    });
  } catch (error) {
    console.error('Start ride error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
