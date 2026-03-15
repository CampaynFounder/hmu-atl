import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRideById, updateRideStatus } from '@/lib/db/rides';
import { getAblyRest, rideChannel } from '@/lib/ably/client';

/**
 * POST /api/rides/[id]/end
 * Driver signals the ride has ended at the dropoff location.
 * Allowed from: in_progress
 * DB transition: in_progress → completed
 * Publishes: ride_ended event to ride channel
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

  if (ride.status !== 'in_progress') {
    return NextResponse.json(
      { error: `Cannot end ride from status '${ride.status}'` },
      { status: 409 }
    );
  }

  const updatedRide = await updateRideStatus(rideId, 'completed');

  const ably = getAblyRest();
  const channel = ably.channels.get(rideChannel(rideId));
  await channel.publish('ride_ended', {
    ride_id: rideId,
    driver_id: userId,
    completed_at: updatedRide.completed_at,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    status: 'completed',
    completed_at: updatedRide.completed_at,
  });
}
