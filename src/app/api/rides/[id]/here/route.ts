import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRideById, getUserByClerkId, updateRideToHere } from '@/lib/db/rides';
import { publishToChannel, rideChannel } from '@/lib/ably/client';
import { notify_driver_here } from '@/lib/notifications/triggers';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:rides:here',
});

/**
 * POST /api/rides/[id]/here
 * Driver signals they have arrived at pickup. Status: otw → here.
 * Stores arrival timestamp in Redis for no-show enforcement.
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
  if (ride.driver_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (ride.status !== 'otw') {
    return NextResponse.json(
      { error: `Cannot transition to here from status '${ride.status}'` },
      { status: 409 },
    );
  }

  const arrivedAt = new Date();

  await Promise.all([
    updateRideToHere(rideId),
    // Store arrival timestamp for no-show enforcement (TTL: 2 hours)
    redis.set(`ride_arrived:${rideId}`, arrivedAt.toISOString(), { ex: 60 * 60 * 2 }),
  ]);

  await Promise.all([
    publishToChannel(rideChannel(rideId), 'driver_here', {
      ride_id: rideId,
      driver_id: user.id,
      arrived_at: arrivedAt.toISOString(),
      timestamp: arrivedAt.toISOString(),
    }),
    notify_driver_here(rideId).catch(() => null),
  ]);

  return NextResponse.json({ ok: true, status: 'here', arrived_at: arrivedAt.toISOString() });
}
