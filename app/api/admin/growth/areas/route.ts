// GET /api/admin/growth/areas — driver distribution per area within a market.
// Used by the growth dashboard's area panel. Returns every active area in the
// market joined to a count of active drivers who list that area in
// driver_profiles.areas[]. Areas with zero drivers are kept in the response so
// the UI can highlight recruitment gaps.
//
// Required: marketId. Without it we can't join to canonical areas (TEXT[] is
// freeform per-market and a global aggregate would be misleading).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');
  if (!marketId) {
    return NextResponse.json({ error: 'marketId required' }, { status: 400 });
  }

  // Active drivers in the market — denominator for percentage calc.
  const totalRows = (await sql`
    SELECT COUNT(*)::int AS c
    FROM users u
    INNER JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.profile_type = 'driver'
      AND u.account_status = 'active'
      AND u.market_id = ${marketId}::uuid
  `) as Array<{ c: number }>;
  const totalDrivers = totalRows[0]?.c ?? 0;

  // Per-area driver count: unnest the areas array and join by slug. Drivers in
  // multiple areas are counted in each — that's intentional, the question is
  // "how covered is each area" not "how many unique drivers per area".
  const rows = (await sql`
    SELECT
      ma.slug,
      ma.name,
      ma.cardinal,
      ma.sort_order,
      COUNT(DISTINCT u.id)::int AS driver_count
    FROM market_areas ma
    LEFT JOIN driver_profiles dp ON dp.areas IS NOT NULL AND ma.slug = ANY(dp.areas)
    LEFT JOIN users u
      ON u.id = dp.user_id
     AND u.profile_type = 'driver'
     AND u.account_status = 'active'
     AND u.market_id = ${marketId}::uuid
    WHERE ma.market_id = ${marketId}::uuid
      AND ma.is_active = TRUE
    GROUP BY ma.slug, ma.name, ma.cardinal, ma.sort_order
    ORDER BY driver_count DESC, ma.sort_order ASC
  `) as Array<{
    slug: string;
    name: string;
    cardinal: string;
    sort_order: number;
    driver_count: number;
  }>;

  const areas = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    cardinal: r.cardinal,
    driverCount: r.driver_count,
    pct: totalDrivers > 0 ? Math.round((r.driver_count / totalDrivers) * 1000) / 10 : 0,
  }));

  return NextResponse.json({
    marketId,
    totalDrivers,
    areas,
    gapsCount: areas.filter((a) => a.driverCount === 0).length,
  });
}
