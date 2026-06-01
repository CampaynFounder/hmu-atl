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
  const rawGender = req.nextUrl.searchParams.get('gender');
  const genderFilter: 'female' | 'male' | null =
    rawGender === 'female' || rawGender === 'male' ? rawGender : null;
  const hasMediaOnly = req.nextUrl.searchParams.get('hasMedia') === '1';
  const fwuOnly = req.nextUrl.searchParams.get('fwu') === '1';
  const areaFilter = req.nextUrl.searchParams.get('area') || null;
  const rawMaxPrice = req.nextUrl.searchParams.get('maxPrice');
  const maxPrice = rawMaxPrice ? Math.max(0, Number(rawMaxPrice)) : null;
  const rawMinAcc = req.nextUrl.searchParams.get('minAcceptanceRate');
  const minAcceptanceRate = rawMinAcc ? Math.min(100, Math.max(0, Number(rawMinAcc))) : null;

  try {
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
      { driverPreference, genderFilter, hasMediaOnly, fwuOnly, areaFilter, maxPrice, minAcceptanceRate, riderLat, riderLng },
      offset,
      limit,
    );

    return NextResponse.json({ drivers, hasMore: drivers.length === limit });
  } catch (err) {
    // A transient Neon hiccup (connection blip, brief timeout) otherwise bubbles
    // as an unhandled throw → 500 → Cloudflare wraps it as a 520. Return a clean
    // JSON 503 so the client can show "try again" instead of choking on HTML.
    console.error('[browse/list] query failed', err);
    return NextResponse.json(
      { error: 'Browse is temporarily unavailable. Try again in a moment.', drivers: [], hasMore: false },
      { status: 503 },
    );
  }
}
