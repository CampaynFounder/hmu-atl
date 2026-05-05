import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';

// Drivers publish a coarse location point here while they're foregrounded.
// Stored on driver_profiles for queryBrowseDrivers to compute distance from
// the rider. NEVER returned to the client — distance is the only thing that
// leaves the server.
//
// Throttled hard server-side as belt-and-suspenders for the publisher's
// 60s/100m client-side throttle. 1 req per driver per 20s.

const RATE_LIMIT_WINDOW_S = 20;
const MAX_ACCURACY_M = 5000; // discard >5km accuracy (cell-tower fallback)

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
    // Too imprecise to be useful — silently drop so the client doesn't
    // retry. 200 means "we got it, no action needed."
    return NextResponse.json({ ok: true, dropped: 'accuracy_too_low' });
  }

  // Resolve to internal user_id and confirm they're a driver.
  const userRows = await sql`
    SELECT u.id, u.profile_type
    FROM users u
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  const user = userRows[0] as { id: string; profile_type: string } | undefined;
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.profile_type !== 'driver') {
    return NextResponse.json({ error: 'Drivers only' }, { status: 403 });
  }

  const limit = await checkRateLimit({
    key: `driver_location:${user.id}`,
    limit: 1,
    windowSeconds: RATE_LIMIT_WINDOW_S,
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
    WHERE user_id = ${user.id}
  `;

  return NextResponse.json({ ok: true });
}

// Driver going offline / opting out — nukes the stored point so they don't
// show distance based on an old location.
export async function DELETE() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  const user = userRows[0] as { id: string } | undefined;
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
