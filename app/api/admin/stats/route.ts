// GET /api/admin/stats?marketId=xxx — Platform stats for live ops dashboard
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');
  const today = new Date().toISOString().split('T')[0];

  const [liveStats, dailyStats, revenueStats, allTimeRevenue, userStats, driverStats] = await Promise.all([
    // Live ride counts — currently active regardless of when created
    marketId ? sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'matched') as matched,
        COUNT(*) FILTER (WHERE status IN ('active', 'otw', 'here', 'confirming')) as active
      FROM rides
      WHERE status IN ('matched', 'active', 'otw', 'here', 'confirming') AND market_id = ${marketId}
    ` : sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'matched') as matched,
        COUNT(*) FILTER (WHERE status IN ('active', 'otw', 'here', 'confirming')) as active
      FROM rides
      WHERE status IN ('matched', 'active', 'otw', 'here', 'confirming')
    `,
    // Daily completed/cancelled/disputed — today only
    marketId ? sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'disputed') as disputed
      FROM rides
      WHERE created_at::date = ${today}::date AND market_id = ${marketId}
    ` : sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'disputed') as disputed
      FROM rides
      WHERE created_at::date = ${today}::date
    `,
    // Today's revenue
    marketId ? sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as total_captured,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as platform_fees,
        COALESCE(SUM(COALESCE(waived_fee_amount, 0)), 0) as fees_waived
      FROM rides
      WHERE status IN ('completed', 'ended') AND created_at::date = ${today}::date AND market_id = ${marketId}
    ` : sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as total_captured,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as platform_fees,
        COALESCE(SUM(COALESCE(waived_fee_amount, 0)), 0) as fees_waived
      FROM rides
      WHERE status IN ('completed', 'ended') AND created_at::date = ${today}::date
    `,
    // All-time revenue
    marketId ? sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as total_captured,
        COUNT(*) as total_rides
      FROM rides
      WHERE status IN ('completed', 'ended') AND market_id = ${marketId}
    ` : sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as total_captured,
        COUNT(*) as total_rides
      FROM rides
      WHERE status IN ('completed', 'ended')
    `,
    // New users today
    marketId ? sql`
      SELECT
        COUNT(*) FILTER (WHERE profile_type = 'rider') as new_riders,
        COUNT(*) FILTER (WHERE profile_type = 'driver') as new_drivers
      FROM users
      WHERE created_at::date = ${today}::date AND market_id = ${marketId}
    ` : sql`
      SELECT
        COUNT(*) FILTER (WHERE profile_type = 'rider') as new_riders,
        COUNT(*) FILTER (WHERE profile_type = 'driver') as new_drivers
      FROM users
      WHERE created_at::date = ${today}::date
    `,
    // Drivers currently on a ride (live)
    marketId ? sql`
      SELECT
        COUNT(DISTINCT driver_id) as on_ride
      FROM rides
      WHERE status IN ('matched', 'otw', 'here', 'confirming', 'active') AND market_id = ${marketId}
    ` : sql`
      SELECT
        COUNT(DISTINCT driver_id) as on_ride
      FROM rides
      WHERE status IN ('matched', 'otw', 'here', 'confirming', 'active')
    `,
  ]);

  const live = liveStats[0] ?? {};
  const daily = dailyStats[0] ?? {};
  const revenue = revenueStats[0] ?? {};
  const allTime = allTimeRevenue[0] ?? {};
  const users = userStats[0] ?? {};
  const drivers = driverStats[0] ?? {};

  return NextResponse.json({
    rides: {
      matched: Number(live.matched ?? 0),
      active: Number(live.active ?? 0),
      completed: Number(daily.completed ?? 0),
      cancelled: Number(daily.cancelled ?? 0),
      disputed: Number(daily.disputed ?? 0),
    },
    revenue: {
      totalCaptured: Number(revenue.total_captured ?? 0),
      platformFees: Number(revenue.platform_fees ?? 0),
      feesWaived: Number(revenue.fees_waived ?? 0),
      allTimeCaptured: Number(allTime.total_captured ?? 0),
      allTimeRides: Number(allTime.total_rides ?? 0),
    },
    users: {
      newRiders: Number(users.new_riders ?? 0),
      newDrivers: Number(users.new_drivers ?? 0),
    },
    drivers: {
      onRide: Number(drivers.on_ride ?? 0),
    },
  });
}
