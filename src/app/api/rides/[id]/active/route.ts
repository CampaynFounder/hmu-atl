import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRideById, updateRideStatus } from '@/lib/db/rides';
import { getAblyRest, rideChannel } from '@/lib/ably/client';

/**
 * POST /api/rides/[id]/active
 * Driver signals the rider has boarded and the ride is in progress.
 * Allowed from: driver_arrived
 * DB transition: driver_arrived → in_progress
 * Publishes: ride_started event to ride channel
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rideId } = await params;

  const ride = await getRideById(rideId);
  if (!ride) {
    return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
  }

  if (ride.driver_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (ride.status !== 'driver_arrived') {
    return NextResponse.json(
      { error: `Cannot transition to ACTIVE from status '${ride.status}'` },
      { status: 409 }
    );
  }

  const updatedRide = await updateRideStatus(rideId, 'in_progress');

  const ably = getAblyRest();
  const channel = ably.channels.get(rideChannel(rideId));
  await channel.publish('ride_started', {
    ride_id: rideId,
    driver_id: userId,
    started_at: updatedRide.started_at,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    status: 'in_progress',
    started_at: updatedRide.started_at,
  });
}
