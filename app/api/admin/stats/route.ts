// GET /api/admin/stats?marketId=xxx — Platform stats for live ops dashboard
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = req.nextUrl.searchParams.get('marketId');

  const mf = (col: string) =>
    marketId ? `AND (${col} = '${marketId}' OR ${col} IS NULL)` : '';

  const [liveStats, lifetimeStats, revenueStats, driverStats, unconvertedStats] = await Promise.all([
    // Live ride counts — currently active regardless of when created
    marketId ? sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'matched') as matched,
        COUNT(*) FILTER (WHERE status IN ('active', 'otw', 'here', 'confirming')) as active
      FROM rides
      WHERE status IN ('matched', 'active', 'otw', 'here', 'confirming')
        AND (market_id = ${marketId} OR market_id IS NULL)
    ` : sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'matched') as matched,
        COUNT(*) FILTER (WHERE status IN ('active', 'otw', 'here', 'confirming')) as active
      FROM rides
      WHERE status IN ('matched', 'active', 'otw', 'here', 'confirming')
    `,

    // Lifetime ride counts — all time
    marketId ? sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('completed', 'ended')) as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'disputed') as disputed,
        COUNT(*) as total
      FROM rides
      WHERE (market_id = ${marketId} OR market_id IS NULL)
    ` : sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('completed', 'ended')) as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'disputed') as disputed,
        COUNT(*) as total
      FROM rides
    `,

    // Lifetime revenue — all completed/ended rides
    marketId ? sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as total_captured,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as platform_fees,
        COALESCE(SUM(COALESCE(waived_fee_amount, 0)), 0) as fees_waived
      FROM rides
      WHERE status IN ('completed', 'ended')
        AND (market_id = ${marketId} OR market_id IS NULL)
    ` : sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as total_captured,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as platform_fees,
        COALESCE(SUM(COALESCE(waived_fee_amount, 0)), 0) as fees_waived
      FROM rides
      WHERE status IN ('completed', 'ended')
    `,

    // Drivers currently on a ride (live)
    marketId ? sql`
      SELECT COUNT(DISTINCT driver_id) as on_ride
      FROM rides
      WHERE status IN ('matched', 'otw', 'here', 'confirming', 'active')
        AND (market_id = ${marketId} OR market_id IS NULL)
    ` : sql`
      SELECT COUNT(DISTINCT driver_id) as on_ride
      FROM rides
      WHERE status IN ('matched', 'otw', 'here', 'confirming', 'active')
    `,

    // Unconverted users — signed up but 0 completed rides
    marketId ? sql`
      SELECT
        COUNT(*) FILTER (WHERE u.profile_type = 'rider') as riders,
        COUNT(*) FILTER (WHERE u.profile_type = 'driver') as drivers,
        COUNT(*) as total
      FROM users u
      WHERE u.completed_rides = 0
        AND u.account_status != 'suspended'
        AND (u.market_id = ${marketId} OR u.market_id IS NULL)
    ` : sql`
      SELECT
        COUNT(*) FILTER (WHERE u.profile_type = 'rider') as riders,
        COUNT(*) FILTER (WHERE u.profile_type = 'driver') as drivers,
        COUNT(*) as total
      FROM users u
      WHERE u.completed_rides = 0
        AND u.account_status != 'suspended'
    `,
  ]);

  const live = liveStats[0] ?? {};
  const lifetime = lifetimeStats[0] ?? {};
  const revenue = revenueStats[0] ?? {};
  const drivers = driverStats[0] ?? {};
  const unconverted = unconvertedStats[0] ?? {};

  return NextResponse.json({
    rides: {
      matched: Number(live.matched ?? 0),
      active: Number(live.active ?? 0),
      completed: Number(lifetime.completed ?? 0),
      cancelled: Number(lifetime.cancelled ?? 0),
      disputed: Number(lifetime.disputed ?? 0),
      total: Number(lifetime.total ?? 0),
    },
    revenue: {
      totalCaptured: Number(revenue.total_captured ?? 0),
      platformFees: Number(revenue.platform_fees ?? 0),
      feesWaived: Number(revenue.fees_waived ?? 0),
    },
    users: {
      unconvertedRiders: Number(unconverted.riders ?? 0),
      unconvertedDrivers: Number(unconverted.drivers ?? 0),
      unconvertedTotal: Number(unconverted.total ?? 0),
    },
    drivers: {
      onRide: Number(drivers.on_ride ?? 0),
    },
  });
}
