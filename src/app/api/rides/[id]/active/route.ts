import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRideById, getUserByClerkId, updateRideToActive } from '@/lib/db/rides';
import { publishToChannel, rideChannel } from '@/lib/ably/client';

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:rides:active',
});

/**
 * POST /api/rides/[id]/active
 * Rider taps BET to confirm boarding. Status: here → active.
 * Only the rider for this ride may call this endpoint.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { success } = await ratelimit.limit(clerkId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { id: rideId } = await params;

  const [user, ride] = await Promise.all([
    getUserByClerkId(clerkId),
    getRideById(rideId),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 403 });
  }
  if (!ride) {
    return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
  }

  // Only the rider may activate the ride (rider taps BET)
  if (ride.rider_id !== user.id) {
    return NextResponse.json(
      { error: 'Forbidden — only the rider can activate the ride' },
      { status: 403 },
    );
  }
  if (ride.status !== 'here') {
    return NextResponse.json(
      { error: `Cannot activate ride from status '${ride.status}'` },
      { status: 409 },
    );
  }

  const updatedRide = await updateRideToActive(rideId);

  await publishToChannel(rideChannel(rideId), 'ride_active', {
    ride_id: rideId,
    rider_id: user.id,
    started_at: updatedRide.started_at,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    status: 'active',
    started_at: updatedRide.started_at,
  });
}
