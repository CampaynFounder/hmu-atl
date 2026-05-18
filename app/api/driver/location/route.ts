import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';

// Driver-location endpoints.
//
// GET  — returns { location_sharing_enabled, home_label, home_lat, home_lng }
//         so DriverPresenceMount knows whether to start the GPS publisher.
// POST — publishes coarse GPS to driver_profiles.current_*. No-ops (200) when
//         location_sharing_enabled = false — prevents any device from
//         accidentally re-enabling GPS for an opted-out driver.
// PATCH — toggles location_sharing_enabled; if toggling off, also clears GPS.
// DELETE — clears stored GPS (driver going offline / hard opt-out).
//
// Throttled: POST 1 req / 20s. PATCH 5 req / 60s.

const POST_RATE_LIMIT_WINDOW_S = 20;
const MAX_ACCURACY_M = 5000;

async function resolveDriver(clerkId: string) {
  const rows = await sql`
    SELECT u.id, u.profile_type,
           dp.location_sharing_enabled,
           dp.home_lat, dp.home_lng, dp.home_label
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
     WHERE u.clerk_id = ${clerkId}
     LIMIT 1
  `;
  return rows[0] as {
    id: string;
    profile_type: string;
    location_sharing_enabled: boolean;
    home_lat: number | null;
    home_lng: number | null;
    home_label: string | null;
  } | undefined;
}

export async function GET(_req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const driver = await resolveDriver(clerkId);
  if (!driver || driver.profile_type !== 'driver') {
    return NextResponse.json({ error: 'Driver profile required' }, { status: 403 });
  }

  return NextResponse.json({
    location_sharing_enabled: driver.location_sharing_enabled,
    home_lat: driver.home_lat,
    home_lng: driver.home_lng,
    home_label: driver.home_label,
  });
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { lat?: number; lng?: number; accuracy?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const accuracy = Number.isFinite(body.accuracy) ? Math.round(Number(body.accuracy)) : null;

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return NextResponse.json({ error: 'Invalid lat' }, { status: 400 });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Invalid lng' }, { status: 400 });
  }
  if (accuracy !== null && accuracy > MAX_ACCURACY_M) {
    return NextResponse.json({ ok: true, dropped: 'accuracy_too_low' });
  }

  const driver = await resolveDriver(clerkId);
  if (!driver) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (driver.profile_type !== 'driver') {
    return NextResponse.json({ error: 'Drivers only' }, { status: 403 });
  }

  // Respect opt-out — return 200 so the client doesn't retry.
  if (!driver.location_sharing_enabled) {
    return NextResponse.json({ ok: true, skipped: 'location_sharing_disabled' });
  }

  const limit = await checkRateLimit({
    key: `driver_location:${driver.id}`,
    limit: 1,
    windowSeconds: POST_RATE_LIMIT_WINDOW_S,
  });
  if (!limit.ok) {
    return NextResponse.json({ ok: true, throttled: true });
  }

  await sql`
    UPDATE driver_profiles
       SET current_lat = ${lat},
           current_lng = ${lng},
           location_accuracy_m = ${accuracy},
           location_updated_at = NOW()
     WHERE user_id = ${driver.id}
  `;

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
  }

  const driver = await resolveDriver(clerkId);
  if (!driver || driver.profile_type !== 'driver') {
    return NextResponse.json({ error: 'Driver profile required' }, { status: 403 });
  }

  const rl = await checkRateLimit({
    key: `driver_location_sharing:${driver.id}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  if (body.enabled) {
    await sql`
      UPDATE driver_profiles
         SET location_sharing_enabled = TRUE
       WHERE user_id = ${driver.id}
    `;
  } else {
    // Disable and clear GPS in one round-trip so stale coords don't linger.
    await sql`
      UPDATE driver_profiles
         SET location_sharing_enabled = FALSE,
             current_lat = NULL,
             current_lng = NULL,
             location_accuracy_m = NULL,
             location_updated_at = NULL
       WHERE user_id = ${driver.id}
    `;
  }

  return NextResponse.json({ ok: true, location_sharing_enabled: body.enabled });
}

export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  const user = rows[0] as { id: string } | undefined;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await sql`
    UPDATE driver_profiles
       SET current_lat = NULL,
           current_lng = NULL,
           location_accuracy_m = NULL,
           location_updated_at = NULL
     WHERE user_id = ${user.id}
  `;

  return NextResponse.json({ ok: true });
}
