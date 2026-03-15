import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { VehicleType } from '@/../lib/db/types';
import { DriverPost, saveDriverPost } from '@/lib/posts';
import { publishDriverPresence } from '@/lib/ably-server';
import { captureEvent } from '@/lib/posthog-server';
import { postRateLimit } from '@/lib/rate-limit';

interface CreateDriverPostBody {
  area: string;
  vehicle_type: VehicleType;
  seat_capacity: number;
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

  const { success } = await postRateLimit.limit(userId);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  let body: CreateDriverPostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    area,
    vehicle_type,
    seat_capacity,
    price_range_min,
    price_range_max,
    time_window,
    message,
  } = body;

  if (
    !area ||
    !vehicle_type ||
    !VEHICLE_TYPES.includes(vehicle_type) ||
    typeof seat_capacity !== 'number' ||
    seat_capacity < 1 ||
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

  const post: DriverPost = {
    id: crypto.randomUUID(),
    driver_id: userId,
    area,
    vehicle_type,
    seat_capacity,
    price_range_min,
    price_range_max,
    time_window,
    message,
    status: 'active',
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  await saveDriverPost(post);

  // Ably: driver enters presence on the area channel
  await publishDriverPresence(area, userId, post.id, 'enter', {
    vehicle_type,
    seat_capacity,
    price_range_min,
    price_range_max,
    expires_at: post.expires_at,
  });

  captureEvent(userId, 'driver_post_created', {
    post_id: post.id,
    area,
    vehicle_type,
    seat_capacity,
    price_range_min,
    price_range_max,
    time_window,
  });

  return NextResponse.json({ post }, { status: 201 });
}
