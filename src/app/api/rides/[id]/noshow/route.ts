import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getRideById, getUserByClerkId, cancelRide } from '@/lib/db/rides';
import { publishToChannel, rideChannel } from '@/lib/ably/client';
import { createTransfer } from '@/lib/stripe';

const NO_SHOW_WAIT_MINUTES = 10;
const NO_SHOW_FEE_CENTS = 500; // $5.00

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:rides:noshow',
});

/**
 * POST /api/rides/[id]/noshow
 * Driver marks rider as no-show after 10min at HERE status.
 * Charges rider $5 (mock behind STRIPE_MOCK).
 * Status: here → cancelled.
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
  if (ride.status !== 'here') {
    return NextResponse.json(
      { error: `No-show requires status 'here', current: '${ride.status}'` },
      { status: 409 },
    );
  }

  // Enforce 10-minute wait from when driver arrived (stored in Redis by /here route)
  const arrivedAtStr = await redis.get<string>(`ride_arrived:${rideId}`);
  if (arrivedAtStr) {
    const waitMs = Date.now() - new Date(arrivedAtStr).getTime();
    const waitMinutes = waitMs / 60_000;
    if (waitMinutes < NO_SHOW_WAIT_MINUTES) {
      const remaining = Math.ceil(NO_SHOW_WAIT_MINUTES - waitMinutes);
      return NextResponse.json(
        { error: `Must wait ${remaining} more minute(s) before declaring no-show` },
        { status: 422 },
      );
    }
  }

  const now = new Date();

  await cancelRide(rideId);

  // Charge rider $5 no-show fee (mock behind STRIPE_MOCK)
  let feeTransferId: string | null = null;
  try {
    const result = await createTransfer({
      amount_cents: NO_SHOW_FEE_CENTS,
      currency: 'usd',
      destination: user.id,
      description: `No-show fee for ride ${rideId}`,
      metadata: { ride_id: rideId, reason: 'no_show' },
    });
    feeTransferId = result.id;
  } catch {
    console.error(`[noshow] Failed to transfer no-show fee for ride ${rideId}`);
  }

  await publishToChannel(rideChannel(rideId), 'ride_cancelled', {
    ride_id: rideId,
    reason: 'no_show',
    cancelled_by: user.id,
    no_show_fee_usd: NO_SHOW_FEE_CENTS / 100,
    fee_transfer_id: feeTransferId,
    cancelled_at: now.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    status: 'cancelled',
    reason: 'no_show',
    fee_charged_usd: NO_SHOW_FEE_CENTS / 100,
    cancelled_at: now.toISOString(),
  });
}
