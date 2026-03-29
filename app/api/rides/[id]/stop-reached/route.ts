import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { isWithinProximity } from '@/lib/geo/distance';
import { publishRideUpdate } from '@/lib/ably/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const { stopOrder, driverLat, driverLng } = body as {
      stopOrder: number;
      driverLat: number;
      driverLng: number;
    };

    if (!stopOrder || !driverLat || !driverLng) {
      return NextResponse.json({ error: 'Missing stopOrder, driverLat, or driverLng' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can mark stops' }, { status: 403 });
    }

    if (!['active', 'otw', 'here'].includes(ride.status as string)) {
      return NextResponse.json({ error: `Cannot mark stop from status: ${ride.status}` }, { status: 400 });
    }

    // Parse stops JSONB
    const stops = Array.isArray(ride.stops) ? [...ride.stops] as Record<string, unknown>[] : [];
    const stopIndex = stops.findIndex(s => Number(s.order) === stopOrder);

    if (stopIndex === -1) {
      return NextResponse.json({ error: `Stop ${stopOrder} not found` }, { status: 404 });
    }

    const stop = stops[stopIndex];

    // Already verified
    if (stop.verified) {
      return NextResponse.json({ status: 'already_verified', stopOrder });
    }

    // Proximity check
    const stopLat = Number(stop.latitude);
    const stopLng = Number(stop.longitude);
    if (!stopLat || !stopLng) {
      return NextResponse.json({ error: 'Stop has no coordinates' }, { status: 400 });
    }

    const result = isWithinProximity(
      { latitude: driverLat, longitude: driverLng },
      { latitude: stopLat, longitude: stopLng }
    );

    if (!result.within) {
      return NextResponse.json({
        status: 'not_reached',
        distanceFeet: result.distanceFeet,
        message: `Still ${result.distanceFeet}ft from stop ${stopOrder}`,
      });
    }

    // Mark stop as reached
    stops[stopIndex] = {
      ...stop,
      reached_at: new Date().toISOString(),
      verified: true,
    };

    await sql`
      UPDATE rides SET
        stops = ${JSON.stringify(stops)}::jsonb,
        updated_at = NOW()
      WHERE id = ${rideId}
    `;

    // Notify rider via Ably
    const completedStops = stops.filter(s => s.verified).length;
    await publishRideUpdate(rideId, 'stop_reached', {
      stopOrder,
      distanceFeet: result.distanceFeet,
      completedStops,
      totalStops: stops.length,
    }).catch(() => {});

    return NextResponse.json({
      status: 'verified',
      stopOrder,
      distanceFeet: result.distanceFeet,
      completedStops,
      totalStops: stops.length,
    });
  } catch (error) {
    console.error('Stop reached error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
