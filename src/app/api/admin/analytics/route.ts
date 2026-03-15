import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import sql from '@/lib/admin/db';

export interface AnalyticsResponse {
  revenue_by_tier: Array<{
    vehicle_type: string;
    total_revenue: number;
    ride_count: number;
    avg_fare: number;
  }>;
  ride_volume: {
    today: number;
    last_7d: number;
    last_30d: number;
    all_time: number;
  };
  dispute_rate: {
    last_30d_rides: number;
    last_30d_disputes: number;
    rate_pct: number;
  };
  active_drivers: number;
  active_riders: number;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const [revenueByTier, rideVolume, disputeStats, userCounts] =
    await Promise.all([
      sql`
        SELECT
          vi.vehicle_type,
          ROUND(SUM(r.total_fare)::numeric, 2)  AS total_revenue,
          COUNT(r.id)::int                       AS ride_count,
          ROUND(AVG(r.total_fare)::numeric, 2)   AS avg_fare
        FROM rides r
        JOIN vehicle_information vi ON vi.id = r.vehicle_id
        WHERE r.status = 'completed'
          AND r.payment_status = 'completed'
        GROUP BY vi.vehicle_type
        ORDER BY total_revenue DESC
      `,

      sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int           AS today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int  AS last_7d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30d,
          COUNT(*)::int                                                      AS all_time
        FROM rides
        WHERE status = 'completed'
      `,

      sql`
        SELECT
          COUNT(DISTINCT r.id)::int  AS last_30d_rides,
          COUNT(DISTINCT d.id)::int  AS last_30d_disputes
        FROM rides r
        LEFT JOIN disputes d
          ON d.ride_id = r.id
         AND d.created_at >= NOW() - INTERVAL '30 days'
        WHERE r.status = 'completed'
          AND r.created_at >= NOW() - INTERVAL '30 days'
      `,

      sql`
        SELECT
          COUNT(*) FILTER (WHERE user_type IN ('driver', 'both') AND is_active = true)::int AS active_drivers,
          COUNT(*) FILTER (WHERE user_type IN ('rider', 'both')  AND is_active = true)::int AS active_riders
        FROM users
      `,
    ]);

  const vol = rideVolume[0] ?? {};
  const ds = disputeStats[0] ?? {};
  const uc = userCounts[0] ?? {};

  const rate_pct =
    ds.last_30d_rides > 0
      ? Math.round((ds.last_30d_disputes / ds.last_30d_rides) * 10000) / 100
      : 0;

  const analytics: AnalyticsResponse = {
    revenue_by_tier: revenueByTier as AnalyticsResponse['revenue_by_tier'],
    ride_volume: {
      today:    vol.today    ?? 0,
      last_7d:  vol.last_7d  ?? 0,
      last_30d: vol.last_30d ?? 0,
      all_time: vol.all_time ?? 0,
    },
    dispute_rate: {
      last_30d_rides:    ds.last_30d_rides    ?? 0,
      last_30d_disputes: ds.last_30d_disputes ?? 0,
      rate_pct,
    },
    active_drivers: uc.active_drivers ?? 0,
    active_riders:  uc.active_riders  ?? 0,
  };

  return NextResponse.json(analytics);
}
