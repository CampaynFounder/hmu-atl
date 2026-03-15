import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Ably from 'ably';

/**
 * POST /api/ably/token?rideId=<id>
 * Returns a short-lived Ably token scoped to ride:<rideId> channel only.
 * Requires a valid Clerk session.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rideId = searchParams.get('rideId');
  if (!rideId) {
    return NextResponse.json({ error: 'rideId is required' }, { status: 400 });
  }

  const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY! });

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: userId,
    capability: {
      [`ride:${rideId}`]: ['subscribe', 'publish'],
    },
    ttl: 60 * 60 * 1000, // 1 hour in ms
  });

  return NextResponse.json(tokenRequest);
}
