// Rider handle uniqueness check. Globally unique across rider + driver
// handles so the future @handle namespace + /d/{handle} URL space don't
// collide. Mirrors the case-insensitive matching pattern from
// /api/drivers/check-handle (which only checks driver_profiles).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle');
  if (!handle) return NextResponse.json({ available: false });

  const normalized = handle.toLowerCase().replace(/\s+/g, '');
  if (normalized.length < 2) {
    return NextResponse.json({ available: false, reason: 'Too short' });
  }
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    return NextResponse.json({ available: false, reason: 'Letters, numbers, _ and - only' });
  }

  // Single round-trip — UNION runs both lookups against the existing case-
  // insensitive indexes on driver_profiles.handle and the new
  // uq_rider_profiles_handle_ci.
  const rows = await sql`
    SELECT 1
    FROM driver_profiles
    WHERE LOWER(REPLACE(handle, ' ', '')) = ${normalized}
    UNION ALL
    SELECT 1
    FROM rider_profiles
    WHERE LOWER(REPLACE(handle, ' ', '')) = ${normalized}
    LIMIT 1
  `;

  return NextResponse.json({ available: rows.length === 0, handle: normalized });
}
