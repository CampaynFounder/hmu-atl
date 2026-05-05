// GET /api/rider/browse/list?offset=N&limit=M&lat=X&lng=Y
// Paginated driver list for the rider-side browse infinite scroll.
// Reuses queryBrowseDrivers so SSR and the client pages walk the same eligibility.
//
// PUBLIC: /rider/browse is now public, so this endpoint must respond to anon
// requests too. We still check Clerk to read driver_preference for signed-in
// riders, but anon callers default to no preference filter.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { queryBrowseDrivers } from '@/lib/hmu/browse-drivers-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 30;

function parseCoord(v: string | null, kind: 'lat' | 'lng'): number | null {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (kind === 'lat' && (n < -90 || n > 90)) return null;
  if (kind === 'lng' && (n < -180 || n > 180)) return null;
  return n;
}

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 12)),
  );

  const riderLat = parseCoord(req.nextUrl.searchParams.get('lat'), 'lat');
  const riderLng = parseCoord(req.nextUrl.searchParams.get('lng'), 'lng');

  let driverPreference: string | null = null;
  if (clerkId) {
    const riderRows = await sql`
      SELECT rp.driver_preference
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.clerk_id = ${clerkId}
      LIMIT 1
    `;
    driverPreference = (riderRows[0]?.driver_preference as string | null) ?? null;
  }

  const drivers = await queryBrowseDrivers(
    { driverPreference, riderLat, riderLng },
    offset,
    limit,
  );

  return NextResponse.json({ drivers, hasMore: drivers.length === limit });
}
