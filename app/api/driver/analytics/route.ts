import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

// Rides with less than this distance or duration are excluded from rate averages.
// GPS cut-outs, test rides, and pre-OTW ends generate absurd $/mi values that poison aggregates.
const MIN_DISTANCE_MI = 0.25;
const MIN_DURATION_MIN = 2;

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
        r.rate_per_mile, r.rate_per_minute,
        r.is_cash
      FROM rides r
      WHERE r.driver_id = ${userId}
        AND r.status IN ('ended', 'completed')
        AND r.total_distance_miles IS NOT NULL
      ORDER BY r.ended_at DESC
      LIMIT 50
    ` as Record<string, unknown>[];

    // Driver aggregate — money-weighted, excludes sub-threshold rides from rate math.
    // AVG(rate_per_mile) would weight a $10/0.1mi outlier equal to a $30/10mi ride, so we use SUM/SUM.
    const aggRows = await sql`
      SELECT
        COUNT(*) FILTER (
          WHERE total_distance_miles >= ${MIN_DISTANCE_MI}
            AND total_duration_minutes >= ${MIN_DURATION_MIN}
        ) as rated_rides,
        SUM(total_distance_miles) FILTER (
          WHERE total_distance_miles >= ${MIN_DISTANCE_MI}
            AND total_duration_minutes >= ${MIN_DURATION_MIN}
        ) as rated_miles,
        SUM(total_duration_minutes) FILTER (
          WHERE total_distance_miles >= ${MIN_DISTANCE_MI}
            AND total_duration_minutes >= ${MIN_DURATION_MIN}
        ) as rated_minutes,
        SUM(COALESCE(driver_payout_amount, final_agreed_price, amount, 0)) FILTER (
          WHERE total_distance_miles >= ${MIN_DISTANCE_MI}
            AND total_duration_minutes >= ${MIN_DURATION_MIN}
        ) as rated_earned,
        SUM(total_distance_miles) as total_miles,
        SUM(total_duration_minutes) as total_minutes,
        COUNT(*) as total_rides,
        SUM(COALESCE(driver_payout_amount, final_agreed_price, amount, 0)) as total_earned,
        COUNT(*) FILTER (
          WHERE total_distance_miles < ${MIN_DISTANCE_MI}
             OR total_duration_minutes < ${MIN_DURATION_MIN}
        ) as excluded_rides
      FROM rides
      WHERE driver_id = ${userId}
        AND status IN ('ended', 'completed')
        AND total_distance_miles IS NOT NULL
    ` as Record<string, unknown>[];

    const agg = aggRows[0] || {};

    const ratedMiles = Number(agg.rated_miles || 0);
    const ratedMinutes = Number(agg.rated_minutes || 0);
    const ratedEarned = Number(agg.rated_earned || 0);

    const avgRatePerMile = ratedMiles > 0 ? ratedEarned / ratedMiles : 0;
    const avgRatePerMinute = ratedMinutes > 0 ? ratedEarned / ratedMinutes : 0;
    const avgRatePerHour = ratedMinutes > 0 ? (ratedEarned / ratedMinutes) * 60 : 0;

    // Daily time-series (last 30 days) — stacked by cash vs non-cash payout.
    const dailyRows = await sql`
      SELECT
        DATE(ended_at AT TIME ZONE 'America/New_York') as day,
        SUM(CASE WHEN is_cash THEN COALESCE(driver_payout_amount, final_agreed_price, amount, 0) ELSE 0 END) as cash,
        SUM(CASE WHEN NOT is_cash THEN COALESCE(driver_payout_amount, final_agreed_price, amount, 0) ELSE 0 END) as non_cash,
        COUNT(*) as rides
      FROM rides
      WHERE driver_id = ${userId}
        AND status IN ('ended', 'completed')
        AND ended_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(ended_at AT TIME ZONE 'America/New_York')
      ORDER BY day ASC
    ` as Record<string, unknown>[];

    const timeseries = fillDailyGaps(dailyRows.map(d => ({
      day: String(d.day).slice(0, 10),
      cash: Math.round(Number(d.cash || 0) * 100) / 100,
      nonCash: Math.round(Number(d.non_cash || 0) * 100) / 100,
      rides: Number(d.rides || 0),
    })), 30);

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

    // Area comparison: percentile rank vs drivers with overlapping areas.
    // Peer average also uses money-weighted math so it compares apples to apples.
    const comparison = {
      area: primaryArea,
      yourAvgPerMile: Math.round(avgRatePerMile * 100) / 100,
      areaAvgPerMile: 0,
      percentile: 50,
      yourAvgPerMinute: Math.round(avgRatePerMinute * 100) / 100,
      areaAvgPerMinute: 0,
    };

    try {
      const compRows = await sql`
        WITH driver_rates AS (
          SELECT
            r.driver_id,
            SUM(COALESCE(r.driver_payout_amount, r.final_agreed_price, r.amount, 0))
              / NULLIF(SUM(r.total_distance_miles), 0) as avg_rpm
          FROM rides r
          WHERE r.status IN ('ended', 'completed')
            AND r.total_distance_miles >= ${MIN_DISTANCE_MI}
            AND r.total_duration_minutes >= ${MIN_DURATION_MIN}
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
      rides: rides.map(r => {
        const dist = r.total_distance_miles ? Number(r.total_distance_miles) : null;
        const dur = r.total_duration_minutes ? Number(r.total_duration_minutes) : null;
        const ratedOk = dist != null && dist >= MIN_DISTANCE_MI && dur != null && dur >= MIN_DURATION_MIN;
        return {
          id: r.id,
          date: r.date,
          pickup: r.pickup_address,
          dropoff: r.dropoff_address,
          amount: Number(r.amount || 0),
          distanceMiles: dist,
          durationMinutes: dur,
          ratePerMile: ratedOk && r.rate_per_mile ? Number(r.rate_per_mile) : null,
          ratePerMinute: ratedOk && r.rate_per_minute ? Number(r.rate_per_minute) : null,
          isCash: Boolean(r.is_cash),
          incompleteGps: !ratedOk,
        };
      }),
      aggregate: {
        avgRatePerMile: Math.round(avgRatePerMile * 100) / 100,
        avgRatePerMinute: Math.round(avgRatePerMinute * 100) / 100,
        avgRatePerHour: Math.round(avgRatePerHour * 100) / 100,
        totalMiles: Math.round(Number(agg.total_miles || 0) * 10) / 10,
        totalMinutes: Number(agg.total_minutes || 0),
        totalRides: Number(agg.total_rides || 0),
        totalEarned: Math.round(Number(agg.total_earned || 0) * 100) / 100,
        ratedRides: Number(agg.rated_rides || 0),
        excludedRides: Number(agg.excluded_rides || 0),
      },
      timeseries,
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

// Pad the time-series with zero-rides for empty days so the chart has a continuous x-axis.
function fillDailyGaps(
  rows: { day: string; cash: number; nonCash: number; rides: number }[],
  days: number,
): { day: string; cash: number; nonCash: number; rides: number }[] {
  const byDay = new Map(rows.map(r => [r.day, r]));
  const out: { day: string; cash: number; nonCash: number; rides: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(byDay.get(key) || { day: key, cash: 0, nonCash: 0, rides: 0 });
  }
  return out;
}
