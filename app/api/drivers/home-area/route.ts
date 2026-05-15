// PATCH /api/drivers/home-area — driver sets/updates their home base.
// DELETE /api/drivers/home-area — driver clears their home base.
//
// Distinct from /api/driver/location (which writes passive GPS to current_*).
// home_* is a stable, user-curated coordinate plus a human-readable label
// pulled from Mapbox. Surfaced on rider discovery cards (PR 5) so a rider
// can see roughly where a driver is based even when the driver is offline.
//
// Auth: Clerk session → users.clerk_id → must have profile_type='driver'.
// Rate-limited per driver (5/min) to keep this from becoming a passive GPS
// firehose — it's user-initiated and shouldn't fire that often.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { isValidCoordinates } from '@/lib/geo/distance';
import { checkRateLimit } from '@/lib/rate-limit/check';

export const runtime = 'nodejs';

interface PatchBody {
  lat?: unknown;
  lng?: unknown;
  label?: unknown;
  mapbox_id?: unknown;
}

async function resolveDriverUserId(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const rows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  const user = rows[0] as { id: string; profile_type: string } | undefined;
  if (!user || user.profile_type !== 'driver') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Driver profile required' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId: user.id };
}

export async function PATCH(req: NextRequest) {
  const a = await resolveDriverUserId();
  if (!a.ok) return a.response;
  const userId = a.userId;

  const rl = await checkRateLimit({
    key: `driver:home-area:${userId}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return NextResponse.json(
      { error: 'lat and lng are required numbers' },
      { status: 400 },
    );
  }
  if (!isValidCoordinates({ latitude: body.lat, longitude: body.lng })) {
    return NextResponse.json({ error: 'Coordinates out of range' }, { status: 400 });
  }

  // label + mapbox_id are optional metadata; clipping label to a reasonable
  // length so a malicious client can't stuff arbitrary blobs.
  const label =
    typeof body.label === 'string' ? body.label.slice(0, 200) : null;
  const mapboxId =
    typeof body.mapbox_id === 'string' ? body.mapbox_id.slice(0, 200) : null;

  const updated = await sql`
    UPDATE driver_profiles SET
      home_lat = ${body.lat},
      home_lng = ${body.lng},
      home_label = ${label},
      home_mapbox_id = ${mapboxId},
      home_updated_at = NOW(),
      updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING home_lat, home_lng, home_label, home_mapbox_id, home_updated_at
  `;
  if (!updated.length) {
    return NextResponse.json(
      { error: 'Driver profile not found' },
      { status: 404 },
    );
  }
  const row = updated[0] as {
    home_lat: number;
    home_lng: number;
    home_label: string | null;
    home_mapbox_id: string | null;
    home_updated_at: Date;
  };
  return NextResponse.json({
    home_lat: Number(row.home_lat),
    home_lng: Number(row.home_lng),
    home_label: row.home_label,
    home_mapbox_id: row.home_mapbox_id,
    home_updated_at: row.home_updated_at,
  });
}

export async function DELETE() {
  const a = await resolveDriverUserId();
  if (!a.ok) return a.response;

  await sql`
    UPDATE driver_profiles SET
      home_lat = NULL,
      home_lng = NULL,
      home_label = NULL,
      home_mapbox_id = NULL,
      home_updated_at = NULL,
      updated_at = NOW()
    WHERE user_id = ${a.userId}
  `;
  return NextResponse.json({ ok: true });
}
