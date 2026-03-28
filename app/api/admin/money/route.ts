// GET /api/admin/money — Financial metrics for money dashboard
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const period = searchParams.get('period') ?? 'daily';

  let interval: string;
  if (period === 'monthly') interval = '30 days';
  else if (period === 'weekly') interval = '7 days';
  else interval = '1 day';

  const [metrics, unitEconomics, dailyRevenue, feeTiers] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount) + COALESCE(add_on_total, 0)), 0) as gmv,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as platform_revenue,
        COALESCE(SUM(COALESCE(waived_fee_amount, 0)), 0) as fees_waived,
        COALESCE(SUM(COALESCE(stripe_fee_amount, 0)), 0) as stripe_fees,
        COALESCE(SUM(COALESCE(driver_payout_amount, 0)), 0) as driver_payouts,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_rides,
        COUNT(*) FILTER (WHERE payment_captured = false AND status = 'ended') as failed_captures
      FROM rides
      WHERE status IN ('completed', 'disputed', 'ended')
        AND created_at > NOW() - ${interval}::interval
    `,
    sql`
      SELECT
        COALESCE(AVG(COALESCE(final_agreed_price, amount)), 0) as avg_price,
        COALESCE(AVG(COALESCE(platform_fee_amount, 0)), 0) as avg_platform_fee,
        COALESCE(AVG(COALESCE(stripe_fee_amount, 0)), 0) as avg_stripe_fee,
        COALESCE(AVG(COALESCE(driver_payout_amount, 0)), 0) as avg_driver_payout,
        COALESCE(AVG(COALESCE(add_on_total, 0)), 0) as avg_add_on,
        COUNT(*) as total_rides
      FROM rides
      WHERE status = 'completed'
        AND created_at > NOW() - ${interval}::interval
    `,
    sql`
      SELECT
        created_at::date as day,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as revenue,
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as gmv,
        COUNT(*) as rides
      FROM rides
      WHERE status = 'completed'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY created_at::date
      ORDER BY day ASC
    `,
    sql`
      SELECT
        u.tier,
        COUNT(*) as ride_count,
        COALESCE(SUM(COALESCE(r.platform_fee_amount, 0)), 0) as total_fees
      FROM rides r
      JOIN users u ON u.id = r.driver_id
      WHERE r.status = 'completed'
        AND r.created_at > NOW() - ${interval}::interval
      GROUP BY u.tier
    `,
  ]);

  const m = metrics[0] ?? {};
  const ue = unitEconomics[0] ?? {};

  return NextResponse.json({
    metrics: {
      gmv: Number(m.gmv ?? 0),
      platformRevenue: Number(m.platform_revenue ?? 0),
      feesWaived: Number(m.fees_waived ?? 0),
      stripeFees: Number(m.stripe_fees ?? 0),
      netPlatformRevenue: Number(m.platform_revenue ?? 0) - Number(m.stripe_fees ?? 0),
      driverPayouts: Number(m.driver_payouts ?? 0),
      failedCaptures: Number(m.failed_captures ?? 0),
      refundsCount: 0,
      refundsSum: 0,
    },
    unitEconomics: {
      avgPrice: Number(ue.avg_price ?? 0),
      avgPlatformFee: Number(ue.avg_platform_fee ?? 0),
      avgStripeFee: Number(ue.avg_stripe_fee ?? 0),
      avgDriverPayout: Number(ue.avg_driver_payout ?? 0),
      avgAddOn: Number(ue.avg_add_on ?? 0),
      totalRides: Number(ue.total_rides ?? 0),
    },
    dailyRevenue: dailyRevenue.map((d: Record<string, unknown>) => ({
      day: d.day,
      revenue: Number(d.revenue ?? 0),
      gmv: Number(d.gmv ?? 0),
      rides: Number(d.rides ?? 0),
    })),
    feeTiers: feeTiers.map((t: Record<string, unknown>) => ({
      tier: t.tier,
      rideCount: Number(t.ride_count ?? 0),
      totalFees: Number(t.total_fees ?? 0),
    })),
    period,
  });
}
