import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRideById, updateRideStatus } from '@/lib/db/rides';
import { getAblyRest, rideChannel } from '@/lib/ably/client';

/**
 * POST /api/rides/[id]/here
 * Driver signals they have arrived at the pickup location.
 * Allowed from: accepted
 * DB transition: accepted → driver_arrived
 * Publishes: driver_arrived event to ride channel
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

  if (ride.status !== 'accepted') {
    return NextResponse.json(
      { error: `Cannot transition to HERE from status '${ride.status}'` },
      { status: 409 }
    );
  }

  const updatedRide = await updateRideStatus(rideId, 'driver_arrived');

  const ably = getAblyRest();
  const channel = ably.channels.get(rideChannel(rideId));
  await channel.publish('driver_arrived', {
    ride_id: rideId,
    driver_id: userId,
    arrived_at: updatedRide.driver_arrived_at,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    status: 'driver_arrived',
    arrived_at: updatedRide.driver_arrived_at,
  });
}
