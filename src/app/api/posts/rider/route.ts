import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { VehicleType } from '@/../lib/db/types';
import { RiderPost, saveRiderPost, matchRiderToDriver } from '@/lib/posts';
import { publishDriverPresence, publishMatch } from '@/lib/ably-server';
import { captureEvent } from '@/lib/posthog-server';
import { postRateLimit } from '@/lib/rate-limit';

interface CreateRiderPostBody {
  pickup_area: string;
  dropoff_area: string;
  vehicle_type_requested: VehicleType;
  seat_count: number;
  price_range_min: number;
  price_range_max: number;
  /** duration in minutes, 1–480 */
  time_window: number;
  message?: string;
}

const VEHICLE_TYPES: VehicleType[] = ['sedan', 'suv', 'van', 'luxury', 'xl'];

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const { success } = await postRateLimit.limit(userId);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: CreateRiderPostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    pickup_area,
    dropoff_area,
    vehicle_type_requested,
    seat_count,
    price_range_min,
    price_range_max,
    time_window,
    message,
  } = body;

  if (
    !pickup_area ||
    !dropoff_area ||
    !vehicle_type_requested ||
    !VEHICLE_TYPES.includes(vehicle_type_requested) ||
    typeof seat_count !== 'number' ||
    seat_count < 1 ||
    typeof price_range_min !== 'number' ||
    typeof price_range_max !== 'number' ||
    price_range_min < 0 ||
    price_range_max < price_range_min ||
    typeof time_window !== 'number' ||
    time_window < 1 ||
    time_window > 480
  ) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 422 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + time_window * 60 * 1000);

  const post: RiderPost = {
    id: crypto.randomUUID(),
    rider_id: userId,
    pickup_area,
    dropoff_area,
    vehicle_type_requested,
    seat_count,
    price_range_min,
    price_range_max,
    time_window,
    message,
    status: 'active',
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  // Save first (so it exists if no match)
  await saveRiderPost(post);

  captureEvent(userId, 'rider_post_created', {
    post_id: post.id,
    pickup_area,
    dropoff_area,
    vehicle_type_requested,
    seat_count,
    price_range_min,
    price_range_max,
    time_window,
  });

  // Attempt area match
  const matchResult = await matchRiderToDriver(post);

  if (matchResult.matched && matchResult.driver_post && matchResult.rider_post) {
    const { driver_post, rider_post } = matchResult;

    // Ably: driver leaves presence (they've been matched)
    await publishDriverPresence(
      pickup_area,
      driver_post.driver_id,
      driver_post.id,
      'leave',
      { reason: 'matched', rider_post_id: post.id }
    );

    // Ably: broadcast the match to the area channel
    await publishMatch(
      pickup_area,
      driver_post.id,
      rider_post.id,
      driver_post.driver_id,
      userId
    );

    captureEvent(userId, 'rider_post_matched', {
      rider_post_id: post.id,
      driver_post_id: driver_post.id,
      area: pickup_area,
    });

    captureEvent(driver_post.driver_id, 'driver_post_matched', {
      driver_post_id: driver_post.id,
      rider_post_id: post.id,
      area: pickup_area,
    });

    return NextResponse.json(
      { post: rider_post, matched: true, driver_post },
      { status: 201 }
    );
  }

  return NextResponse.json({ post, matched: false }, { status: 201 });
}
