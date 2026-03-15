import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRideById, getUserByClerkId, updateRideToEnded } from '@/lib/db/rides';
import { publishToChannel, rideChannel } from '@/lib/ably/client';
import { notify_ride_ended } from '@/lib/notifications/triggers';

const DISPUTE_WINDOW_MINUTES = 45;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:rides:end',
});

/**
 * POST /api/rides/[id]/end
 * Driver ends the ride. Status: active → ended.
 * Sets ended_at and dispute_window_expires_at (NOW + 45min).
 * Stores dispute:timer:{rideId} in Redis with 45min TTL.
 * Publishes ride_ended event and triggers notify_ride_ended.
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
  if (ride.status !== 'active') {
    return NextResponse.json(
      { error: `Cannot end ride from status '${ride.status}'` },
      { status: 409 },
    );
  }

  const now = new Date();
  const disputeWindowExpiresAt = new Date(now.getTime() + DISPUTE_WINDOW_MINUTES * 60 * 1000);
  const ttlSeconds = DISPUTE_WINDOW_MINUTES * 60;

  const updatedRide = await updateRideToEnded(rideId, disputeWindowExpiresAt);

  // Store dispute timer in Redis with 45-min TTL
  await redis.set(
    `dispute:timer:${rideId}`,
    disputeWindowExpiresAt.toISOString(),
    { ex: ttlSeconds },
  );

  await Promise.all([
    publishToChannel(rideChannel(rideId), 'ride_ended', {
      ride_id: rideId,
      driver_id: user.id,
      ended_at: updatedRide.ended_at,
      dispute_window_expires_at: disputeWindowExpiresAt.toISOString(),
      timestamp: now.toISOString(),
    }),
    notify_ride_ended(rideId).catch(() => null),
  ]);

  return NextResponse.json({
    ok: true,
    status: 'ended',
    ended_at: updatedRide.ended_at,
    dispute_window_expires_at: disputeWindowExpiresAt.toISOString(),
  });
}
