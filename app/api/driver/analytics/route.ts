import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Per-ride metrics (last 50 completed rides with analytics)
    const rides = await sql`
      SELECT
        r.id, r.ended_at as date,
        r.pickup_address, r.dropoff_address,
        COALESCE(r.driver_payout_amount, r.final_agreed_price, r.amount, 0) as amount,
        r.total_distance_miles, r.total_duration_minutes,
        r.rate_per_mile, r.rate_per_minute
      FROM rides r
      WHERE r.driver_id = ${userId}
        AND r.status IN ('ended', 'completed')
        AND r.total_distance_miles IS NOT NULL
      ORDER BY r.ended_at DESC
      LIMIT 50
    ` as Record<string, unknown>[];

    // Driver aggregate
    const aggRows = await sql`
      SELECT
        AVG(rate_per_mile) as avg_rate_per_mile,
        AVG(rate_per_minute) as avg_rate_per_minute,
        SUM(total_distance_miles) as total_miles,
        SUM(total_duration_minutes) as total_minutes,
        COUNT(*) as total_rides,
        SUM(COALESCE(driver_payout_amount, final_agreed_price, amount, 0)) as total_earned
      FROM rides
      WHERE driver_id = ${userId}
        AND status IN ('ended', 'completed')
        AND total_distance_miles IS NOT NULL
    ` as Record<string, unknown>[];

    const agg = aggRows[0] || {};

    // Get driver's areas for comparison
    const driverProfileRows = await sql`
      SELECT areas FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
    ` as Record<string, unknown>[];

    const driverAreas = driverProfileRows[0]?.areas;
    // areas is JSONB — could be array or object with keys
    const areaNames: string[] = Array.isArray(driverAreas)
      ? driverAreas
      : (typeof driverAreas === 'object' && driverAreas !== null)
        ? Object.keys(driverAreas)
        : [];

    const primaryArea = areaNames[0] || 'Atlanta';

    // Area comparison: percentile rank vs drivers with overlapping areas
    let comparison = {
      area: primaryArea,
      yourAvgPerMile: Number(agg.avg_rate_per_mile || 0),
      areaAvgPerMile: 0,
      percentile: 50,
      yourAvgPerMinute: Number(agg.avg_rate_per_minute || 0),
      areaAvgPerMinute: 0,
    };

    try {
      // Get all drivers' avg rates who have overlapping areas
      const compRows = await sql`
        WITH driver_rates AS (
          SELECT
            r.driver_id,
            AVG(r.rate_per_mile) as avg_rpm
          FROM rides r
          WHERE r.status IN ('ended', 'completed')
            AND r.total_distance_miles IS NOT NULL
            AND r.rate_per_mile IS NOT NULL
            AND r.driver_id IN (
              SELECT dp.user_id FROM driver_profiles dp
              WHERE dp.areas::text LIKE ANY(
                SELECT '%' || unnest || '%' FROM unnest(ARRAY[${primaryArea}])
              )
            )
          GROUP BY r.driver_id
          HAVING COUNT(*) >= 3
        )
        SELECT
          AVG(avg_rpm) as area_avg,
          PERCENT_RANK() OVER (ORDER BY MAX(CASE WHEN driver_id = ${userId} THEN avg_rpm END)) as pct
        FROM driver_rates
      ` as Record<string, unknown>[];

      if (compRows.length > 0) {
        comparison.areaAvgPerMile = Math.round(Number(compRows[0].area_avg || 0) * 100) / 100;
        comparison.percentile = Math.round(Number(compRows[0].pct || 0.5) * 100);
      }
    } catch {
      // Comparison is non-critical
    }

    return NextResponse.json({
      rides: rides.map(r => ({
        id: r.id,
        date: r.date,
        pickup: r.pickup_address,
        dropoff: r.dropoff_address,
        amount: Number(r.amount || 0),
        distanceMiles: r.total_distance_miles ? Number(r.total_distance_miles) : null,
        durationMinutes: r.total_duration_minutes ? Number(r.total_duration_minutes) : null,
        ratePerMile: r.rate_per_mile ? Number(r.rate_per_mile) : null,
        ratePerMinute: r.rate_per_minute ? Number(r.rate_per_minute) : null,
      })),
      aggregate: {
        avgRatePerMile: Math.round(Number(agg.avg_rate_per_mile || 0) * 100) / 100,
        avgRatePerMinute: Math.round(Number(agg.avg_rate_per_minute || 0) * 100) / 100,
        totalMiles: Math.round(Number(agg.total_miles || 0) * 10) / 10,
        totalMinutes: Number(agg.total_minutes || 0),
        totalRides: Number(agg.total_rides || 0),
        totalEarned: Math.round(Number(agg.total_earned || 0) * 100) / 100,
      },
      comparison,
    });
  } catch (error) {
    console.error('Driver analytics error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
