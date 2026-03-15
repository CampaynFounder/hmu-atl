import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import Ably from 'ably';
import { getRideById, getUserByClerkId } from '@/lib/db/rides';

const ratelimit = new Ratelimit({
  redis: new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  }),
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix: 'rl:ably:token',
});

/**
 * POST /api/ably/token?rideId=<id>
 *
 * Issues a scoped Ably JWT to the authenticated user.
 * Validates Clerk session first.
 * Verifies the user is a participant in the requested ride.
 * Scopes the token to only the ride:{rideId} channel.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { success } = await ratelimit.limit(clerkId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const rideId = searchParams.get('rideId');
  if (!rideId) {
    return NextResponse.json({ error: 'rideId query param is required' }, { status: 400 });
  }

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

  // User must be a participant in this ride
  const isParticipant = ride.driver_id === user.id || ride.rider_id === user.id;
  if (!isParticipant) {
    return NextResponse.json(
      { error: 'Forbidden — not a participant in this ride' },
      { status: 403 },
    );
  }

  const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY! });

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: user.id,
    capability: {
      [`ride:${rideId}`]: ['subscribe', 'publish'],
    },
    ttl: 60 * 60 * 1000, // 1 hour in ms
  });

  return NextResponse.json(tokenRequest);
}
