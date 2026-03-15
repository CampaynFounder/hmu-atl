import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { getAblyRest, rideChannel } from '@/lib/ably/client';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * POST /api/rides/[id]/gps-timeout
 * Called by QStash ~90 seconds after the last GPS update.
 * If the GPS sentinel key no longer exists in Redis, the driver's
 * connection has been lost — publish connection_lost to Ably.
 */
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rideId } = await params;

  const timeoutKey = `gps_timeout:${rideId}`;
  const lastUpdate = await redis.get(timeoutKey);

  // Key still alive → recent GPS update received, no timeout
  if (lastUpdate) {
    return NextResponse.json({ ok: true, timed_out: false });
  }

  // Key expired → no GPS update in 90s → publish connection_lost
  const ably = getAblyRest();
  const channel = ably.channels.get(rideChannel(rideId));
  await channel.publish('connection_lost', {
    ride_id: rideId,
    timestamp: new Date().toISOString(),
    reason: 'No GPS update received in 90 seconds',
  });

  return NextResponse.json({ ok: true, timed_out: true });
}

export const POST = verifySignatureAppRouter(handler);
