import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { Redis } from '@upstash/redis';
import { getRideById, getUserByClerkId, insertRideLocation } from '@/lib/db/rides';
import { publishToChannel, rideChannel } from '@/lib/ably/client';

const GPS_MIN_INTERVAL_SECONDS = 10;
const GPS_TIMEOUT_SECONDS = 90;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * POST /api/rides/[id]/location
 * Body: { lat: number; lng: number }
 *
 * - Validates Clerk session
 * - Validates caller is the driver for this ride
 * - Throttles via Redis — rejects if last update < 10 seconds ago
 * - INSERTs into ride_locations table
 * - Publishes location to ride:{id} Ably channel
 * - Checks 90s GPS timeout: if previous location was >90s ago, publishes connection_lost
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  // Only the driver may broadcast location
  if (ride.driver_id !== user.id) {
    return NextResponse.json(
      { error: 'Forbidden — only the driver can broadcast location' },
      { status: 403 },
    );
  }

  if (!['otw', 'here', 'active'].includes(ride.status)) {
    return NextResponse.json({ error: 'Ride is not in a trackable state' }, { status: 409 });
  }

  // Throttle: reject if last update < 10 seconds ago
  const throttleKey = `gps:throttle:${rideId}`;
  const throttled = await redis.get(throttleKey);
  if (throttled) {
    return NextResponse.json(
      { error: 'GPS updates must be at least 10 seconds apart' },
      { status: 429 },
    );
  }

  let body: { lat?: unknown; lng?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lat, lng } = body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json(
      { error: 'lat and lng are required numbers' },
      { status: 400 },
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Check for 90s GPS gap — detect if driver reconnected after connection_lost
  const lastTimestampStr = await redis.get<string>(`gps:last:${rideId}`);
  let connectionLost = false;
  if (lastTimestampStr) {
    const gapSeconds = (now.getTime() - new Date(lastTimestampStr).getTime()) / 1000;
    if (gapSeconds > GPS_TIMEOUT_SECONDS) {
      connectionLost = true;
    }
  }

  // Set throttle key (10s TTL) and update last-seen sentinel (1h TTL)
  await Promise.all([
    redis.set(throttleKey, '1', { ex: GPS_MIN_INTERVAL_SECONDS }),
    redis.set(`gps:last:${rideId}`, nowIso, { ex: 60 * 60 }),
  ]);

  // Write location to Neon ride_locations table
  await insertRideLocation({ ride_id: rideId, lat, lng });

  const channel = rideChannel(rideId);

  // Publish location update and optionally connection_lost
  const publishes: Promise<void>[] = [
    publishToChannel(channel, 'location', {
      lat,
      lng,
      timestamp: nowIso,
      driver_id: user.id,
    }),
  ];

  if (connectionLost) {
    publishes.push(
      publishToChannel(channel, 'connection_lost', {
        ride_id: rideId,
        gap_seconds: Math.floor((now.getTime() - new Date(lastTimestampStr!).getTime()) / 1000),
        timestamp: nowIso,
      }),
    );
  }

  await Promise.all(publishes);

  return NextResponse.json({ ok: true, timestamp: nowIso });
}
