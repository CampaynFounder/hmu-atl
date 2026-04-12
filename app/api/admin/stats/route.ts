// GET /api/admin/stats?marketId=xxx — Today's platform stats for live ops dashboard
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');
  const today = new Date().toISOString().split('T')[0];

  const [rideStats, revenueStats, userStats, driverStats] = await Promise.all([
    marketId ? sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'matched') as matched,
        COUNT(*) FILTER (WHERE status IN ('active', 'otw', 'here', 'confirming')) as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'disputed') as disputed
      FROM rides
      WHERE created_at::date = ${today}::date AND market_id = ${marketId}
    ` : sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'matched') as matched,
        COUNT(*) FILTER (WHERE status IN ('active', 'otw', 'here', 'confirming')) as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'disputed') as disputed
      FROM rides
      WHERE created_at::date = ${today}::date
    `,
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
    marketId ? sql`
      SELECT
        COUNT(DISTINCT driver_id) FILTER (WHERE status IN ('matched', 'otw', 'here', 'confirming', 'active')) as on_ride
      FROM rides
      WHERE created_at::date = ${today}::date AND market_id = ${marketId}
    ` : sql`
      SELECT
        COUNT(DISTINCT driver_id) FILTER (WHERE status IN ('matched', 'otw', 'here', 'confirming', 'active')) as on_ride
      FROM rides
      WHERE created_at::date = ${today}::date
    `,
  ]);

  const rides = rideStats[0] ?? {};
  const revenue = revenueStats[0] ?? {};
  const users = userStats[0] ?? {};
  const drivers = driverStats[0] ?? {};

  return NextResponse.json({
    rides: {
      matched: Number(rides.matched ?? 0),
      active: Number(rides.active ?? 0),
      completed: Number(rides.completed ?? 0),
      cancelled: Number(rides.cancelled ?? 0),
      disputed: Number(rides.disputed ?? 0),
    },
    revenue: {
      totalCaptured: Number(revenue.total_captured ?? 0),
      platformFees: Number(revenue.platform_fees ?? 0),
      feesWaived: Number(revenue.fees_waived ?? 0),
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
