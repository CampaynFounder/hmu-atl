import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRideById } from '@/lib/db/rides';
import { getAblyRest, rideChannel } from '@/lib/ably/client';

/**
 * POST /api/rides/[id]/otw
 * Driver signals they are on the way to pick up the rider.
 * Allowed from: accepted
 * DB status: remains 'accepted' (no DB transition needed — just Ably event)
 * Publishes: driver_otw event to ride channel
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
      { error: `Cannot transition to OTW from status '${ride.status}'` },
      { status: 409 }
    );
  }

  const ably = getAblyRest();
  const channel = ably.channels.get(rideChannel(rideId));
  await channel.publish('driver_otw', {
    ride_id: rideId,
    driver_id: userId,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, status: 'accepted', event: 'driver_otw' });
}
