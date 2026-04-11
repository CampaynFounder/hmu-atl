import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser, publishAdminEvent } from '@/lib/ably/server';
import { notifyRiderDriverHere } from '@/lib/sms/textbee';
import { isWithinProximity } from '@/lib/geo/distance';
import { syncBookingFromRide } from '@/lib/schedule/conflicts';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    // Accept driver GPS from body
    let driverLat: number | null = null;
    let driverLng: number | null = null;
    try {
      const body = await req.json();
      driverLat = body.driverLat || null;
      driverLng = body.driverLng || null;
    } catch { /* no body is ok */ }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can mark HERE' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'here')) {
      return NextResponse.json({ error: `Cannot mark HERE from status: ${ride.status}` }, { status: 400 });
    }

    // Geo-verify: is driver near validated pickup address?
    let hereProximityFt: number | null = null;
    let hereVerified: boolean | null = null;
    if (driverLat && driverLng && ride.pickup_lat && ride.pickup_lng) {
      const result = isWithinProximity(
        { latitude: driverLat, longitude: driverLng },
        { latitude: Number(ride.pickup_lat), longitude: Number(ride.pickup_lng) }
      );
      hereProximityFt = result.distanceFeet;
      hereVerified = result.within;
    }

    await sql`
      UPDATE rides SET
        status = 'here',
        here_at = NOW(),
        driver_here_lat = ${driverLat},
        driver_here_lng = ${driverLng},
        here_proximity_ft = ${hereProximityFt},
        here_verified = ${hereVerified},
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'otw'
    `;

    syncBookingFromRide(rideId, 'here').catch(() => {});

    const waitMinutes = Number(ride.wait_minutes ?? 10);

    await publishRideUpdate(rideId, 'status_change', { status: 'here', message: 'Driver has arrived', waitMinutes }).catch(() => {});
    await notifyUser(ride.rider_id as string, 'ride_update', { rideId, status: 'here', message: 'Your driver is here!', waitMinutes }).catch(() => {});
    publishAdminEvent('ride_status_change', { rideId, status: 'here', hereVerified }).catch(() => {});

    // SMS rider
    try {
      const [riderPhoneRows, driverNameRows] = await Promise.all([
        sql`SELECT phone FROM rider_profiles WHERE user_id = ${ride.rider_id} LIMIT 1`,
        sql`SELECT handle FROM driver_profiles WHERE user_id = ${userId} LIMIT 1`,
      ]);
      const riderPhone = (riderPhoneRows[0] as Record<string, unknown>)?.phone as string;
      const driverName = (driverNameRows[0] as Record<string, unknown>)?.handle as string || 'Your driver';
      if (riderPhone) notifyRiderDriverHere(riderPhone, driverName).catch(() => {});
    } catch { /* non-blocking */ }

    return NextResponse.json({ status: 'here', rideId, waitMinutes });
  } catch (error) {
    console.error('HERE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
