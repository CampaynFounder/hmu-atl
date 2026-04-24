// GET /api/driver/find-riders/list?offset=N&limit=M
// Paginated masked-rider list for the client-side infinite scroll.
// The SAME query helper is used by the initial server render in
// app/driver/find-riders/page.tsx so eligibility logic stays consistent.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { getCurrentUser } from '@/lib/auth/guards';
import { queryMaskedRiders } from '@/lib/hmu/find-riders-query';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 30;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.profile_type !== 'driver') {
    return NextResponse.json({ error: 'Drivers only' }, { status: 403 });
  }

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 12)),
  );

  const driverRows = await sql`
    SELECT u.market_id,
           dp.gender AS driver_gender,
           up.rider_gender_pref AS driver_rider_gender_pref
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN user_preferences up ON up.user_id = u.id
    WHERE u.id = ${user.id} LIMIT 1
  `;
  const d = driverRows[0] as Record<string, unknown> | undefined;

  const riders = await queryMaskedRiders(
    {
      id: user.id,
      marketId: (d?.market_id as string | null) ?? null,
      gender: ((d?.driver_gender as string | null) || '').toLowerCase(),
      riderGenderPref: (d?.driver_rider_gender_pref as string | null) ?? null,
    },
    offset,
    limit,
  );

  return NextResponse.json({ riders, hasMore: riders.length === limit });
}
