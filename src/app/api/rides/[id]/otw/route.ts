import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRideById, getUserByClerkId, updateRideToOtw } from '@/lib/db/rides';
import { publishToChannel, rideChannel } from '@/lib/ably/client';
import { notify_driver_otw } from '@/lib/notifications/triggers';

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:rides:otw',
});

/**
 * POST /api/rides/[id]/otw
 * Driver signals they are on the way. Status: matched → otw.
 * Updates DB, publishes event, sends notification.
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
  if (ride.status !== 'matched') {
    return NextResponse.json(
      { error: `Cannot transition to otw from status '${ride.status}'` },
      { status: 409 },
    );
  }

  await updateRideToOtw(rideId);

  await Promise.all([
    publishToChannel(rideChannel(rideId), 'driver_otw', {
      ride_id: rideId,
      driver_id: user.id,
      timestamp: new Date().toISOString(),
    }),
    notify_driver_otw(rideId).catch(() => null),
  ]);

  return NextResponse.json({ ok: true, status: 'otw' });
}
