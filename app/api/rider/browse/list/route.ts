// GET /api/rider/browse/list?offset=N&limit=M
// Paginated driver list for the rider-side browse infinite scroll.
// Reuses queryBrowseDrivers so SSR and the client pages walk the same eligibility.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { queryBrowseDrivers } from '@/lib/hmu/browse-drivers-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 30;

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 12)),
  );

  const riderRows = await sql`
    SELECT rp.driver_preference
    FROM users u
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  const driverPreference = (riderRows[0]?.driver_preference as string | null) ?? null;

  const drivers = await queryBrowseDrivers({ driverPreference }, offset, limit);

  return NextResponse.json({ drivers, hasMore: drivers.length === limit });
}
