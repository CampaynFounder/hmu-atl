import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Redis } from '@upstash/redis';
import { Client as QStash } from '@upstash/qstash';
import { getAblyRest, rideChannel } from '@/lib/ably/client';
import { getRideById, insertGpsPoint } from '@/lib/db/rides';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const qstash = new QStash({ token: process.env.QSTASH_TOKEN! });

const GPS_MIN_INTERVAL_SECONDS = 10;
const GPS_TIMEOUT_SECONDS = 90;

/**
 * POST /api/rides/[id]/location
 * Body: { latitude, longitude, heading?, speed_kmh? }
 *
 * - Validates Clerk session
 * - Enforces 10-second minimum interval via Redis (per-ride, per-user)
 * - Writes GPS point to Neon
 * - Publishes location to ride Ably channel
 * - Schedules 90s GPS timeout check via QStash
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

  // Validate ride exists and is active
  const ride = await getRideById(rideId);
  if (!ride) {
    return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
  }
  if (ride.status !== 'accepted' && ride.status !== 'driver_arrived' && ride.status !== 'in_progress') {
    return NextResponse.json({ error: 'Ride is not active' }, { status: 409 });
  }

  // Enforce 10-second minimum interval
  const throttleKey = `gps_throttle:${rideId}:${userId}`;
  const throttled = await redis.get(throttleKey);
  if (throttled) {
    return NextResponse.json(
      { error: 'GPS updates must be at least 10 seconds apart' },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { latitude, longitude, heading, speed_kmh } = body;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return NextResponse.json(
      { error: 'latitude and longitude are required numbers' },
      { status: 400 }
    );
  }

  const now = new Date();

  // Set throttle key (10s TTL)
  await redis.set(throttleKey, '1', { ex: GPS_MIN_INTERVAL_SECONDS });

  // Refresh GPS timeout sentinel key (90s TTL)
  const timeoutKey = `gps_timeout:${rideId}`;
  await redis.set(timeoutKey, now.toISOString(), { ex: GPS_TIMEOUT_SECONDS });

  // Write GPS point to Neon
  await insertGpsPoint({
    ride_id: rideId,
    latitude,
    longitude,
    recorded_at: now,
    heading,
    speed_kmh,
  });

  // Publish to Ably
  const ably = getAblyRest();
  const channel = ably.channels.get(rideChannel(rideId));
  await channel.publish('location', {
    latitude,
    longitude,
    heading: heading ?? null,
    speed_kmh: speed_kmh ?? null,
    timestamp: now.toISOString(),
    user_id: userId,
  });

  // Schedule 90s GPS timeout check via QStash
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  await qstash.publishJSON({
    url: `${baseUrl}/api/rides/${rideId}/gps-timeout`,
    body: { rideId, scheduledAt: now.toISOString() },
    delay: GPS_TIMEOUT_SECONDS,
  });

  return NextResponse.json({ ok: true, timestamp: now.toISOString() });
}
