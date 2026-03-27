import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

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
const CONFIRM_TIMEOUT_MS = 120_000; // 2 minutes

/**
 * Driver taps "Start Ride" from HERE status.
 * - Checks proximity (100m) between driver and rider if GPS available
 * - Transitions ride to "confirming"
 * - Sends Ably confirm_start event → rider sees "Confirm you're in the car"
 * - Rider has 2 min to confirm via /confirm-start endpoint
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

    // Only driver can initiate start
    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can start the ride' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'confirming')) {
      return NextResponse.json({ error: `Cannot start ride from status: ${ride.status}` }, { status: 400 });
    }

    // Proximity check — advisory, not blocking (rider may not have GPS)
    let proximityOk: boolean | null = null;
    let distanceM: number | null = null;
    const riderLat = Number(ride.rider_start_lat || ride.pickup_lat) || null;
    const riderLng = Number(ride.rider_start_lng || ride.pickup_lng) || null;

    if (driverLat && driverLng && riderLat && riderLng) {
      distanceM = haversineMeters(driverLat, driverLng, riderLat, riderLng);
      proximityOk = distanceM <= PROXIMITY_THRESHOLD_M;
    }

    // Calculate confirm deadline
    const confirmDeadline = new Date(Date.now() + CONFIRM_TIMEOUT_MS).toISOString();

    await sql`
      UPDATE rides SET
        status = 'confirming',
        driver_start_lat = ${driverLat},
        driver_start_lng = ${driverLng},
        confirm_deadline = ${confirmDeadline},
        proximity_check_m = ${distanceM},
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'here'
    `;

    // Ably: tell rider to confirm
    await publishRideUpdate(rideId, 'confirm_start', {
      status: 'confirming',
      confirmDeadline,
      proximityOk,
      distanceM,
      message: 'Driver started the ride — confirm you\'re in the car',
    }).catch(() => {});

    // Also push notification to rider
    await notifyUser(ride.rider_id as string, 'ride_update', {
      rideId,
      status: 'confirming',
      confirmDeadline,
      message: 'Confirm you\'re in the car to start the ride',
    }).catch(() => {});

    return NextResponse.json({
      status: 'confirming',
      rideId,
      confirmDeadline,
      proximityOk,
      distanceM: distanceM ? Math.round(distanceM) : null,
      confirmTimeoutMs: CONFIRM_TIMEOUT_MS,
    });
  } catch (error) {
    console.error('Start ride error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
