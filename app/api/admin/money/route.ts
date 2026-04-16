// GET /api/admin/money — Financial metrics for money dashboard
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { auditFees } from '@/lib/admin/fee-audit';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const period = searchParams.get('period') ?? 'all';

  const isAllTime = period === 'all';
  let interval: string;
  if (period === 'monthly') interval = '30 days';
  else if (period === 'weekly') interval = '7 days';
  else if (period === 'daily') interval = '1 day';
  else interval = '3650 days'; // all-time fallback (10 years)

  const timeFilter = isAllTime ? sql`` : sql`AND r.created_at > NOW() - ${interval}::interval`;
  const timeFilterPlain = isAllTime ? sql`` : sql`AND created_at > NOW() - ${interval}::interval`;

  // Use explicit branches for time filter since sql`` fragments don't compose
  const [metrics, unitEconomics, dailyRevenue, feeTiers, cashStats] = await Promise.all([
    isAllTime ? sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount) + COALESCE(add_on_total, 0)), 0) as gmv,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as platform_revenue,
        COALESCE(SUM(COALESCE(waived_fee_amount, 0)), 0) as fees_waived,
        COALESCE(SUM(COALESCE(stripe_fee_amount, 0)), 0) as stripe_fees,
        COALESCE(SUM(COALESCE(driver_payout_amount, 0)), 0) as driver_payouts,
        COUNT(*) as total_rides,
        COUNT(*) FILTER (WHERE payment_captured = false AND status = 'ended') as failed_captures,
        COUNT(*) FILTER (WHERE is_cash = true) as cash_rides,
        COALESCE(SUM(CASE WHEN is_cash = true THEN COALESCE(final_agreed_price, amount) ELSE 0 END), 0) as cash_gmv
      FROM rides
      WHERE status IN ('completed', 'disputed', 'ended')
    ` : sql`
      SELECT
        COALESCE(SUM(COALESCE(final_agreed_price, amount) + COALESCE(add_on_total, 0)), 0) as gmv,
        COALESCE(SUM(COALESCE(platform_fee_amount, 0)), 0) as platform_revenue,
        COALESCE(SUM(COALESCE(waived_fee_amount, 0)), 0) as fees_waived,
        COALESCE(SUM(COALESCE(stripe_fee_amount, 0)), 0) as stripe_fees,
        COALESCE(SUM(COALESCE(driver_payout_amount, 0)), 0) as driver_payouts,
        COUNT(*) as total_rides,
        COUNT(*) FILTER (WHERE payment_captured = false AND status = 'ended') as failed_captures,
        COUNT(*) FILTER (WHERE is_cash = true) as cash_rides,
        COALESCE(SUM(CASE WHEN is_cash = true THEN COALESCE(final_agreed_price, amount) ELSE 0 END), 0) as cash_gmv
      FROM rides
      WHERE status IN ('completed', 'disputed', 'ended')
        AND created_at > NOW() - ${interval}::interval
    `,

    isAllTime ? sql`
      SELECT
        COALESCE(AVG(COALESCE(final_agreed_price, amount)), 0) as avg_price,
        COALESCE(AVG(COALESCE(platform_fee_amount, 0)), 0) as avg_platform_fee,
        COALESCE(AVG(COALESCE(stripe_fee_amount, 0)), 0) as avg_stripe_fee,
        COALESCE(AVG(COALESCE(driver_payout_amount, 0)), 0) as avg_driver_payout,
        COUNT(*) as total_rides
      FROM rides
      WHERE status = 'completed'
    ` : sql`
      SELECT
        COALESCE(AVG(COALESCE(final_agreed_price, amount)), 0) as avg_price,
        COALESCE(AVG(COALESCE(platform_fee_amount, 0)), 0) as avg_platform_fee,
        COALESCE(AVG(COALESCE(stripe_fee_amount, 0)), 0) as avg_stripe_fee,
        COALESCE(AVG(COALESCE(driver_payout_amount, 0)), 0) as avg_driver_payout,
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
        COALESCE(SUM(COALESCE(stripe_fee_amount, 0)), 0) as stripe_fees,
        COUNT(*) as rides
      FROM rides
      WHERE status = 'completed'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY created_at::date
      ORDER BY day ASC
    `,

    isAllTime ? sql`
      SELECT
        u.tier,
        COUNT(*) as ride_count,
        COALESCE(SUM(COALESCE(r.platform_fee_amount, 0)), 0) as total_fees
      FROM rides r
      JOIN users u ON u.id = r.driver_id
      WHERE r.status = 'completed'
      GROUP BY u.tier
    ` : sql`
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

    // Cash ride stats
    isAllTime ? sql`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as total
      FROM rides
      WHERE status IN ('completed', 'ended') AND is_cash = true
    ` : sql`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(COALESCE(final_agreed_price, amount)), 0) as total
      FROM rides
      WHERE status IN ('completed', 'ended') AND is_cash = true
        AND created_at > NOW() - ${interval}::interval
    `,
  ]);

  // Revenue streams + fee audit (non-blocking — don't fail the whole response)
  let revenueStreams = null;
  let feeAudit = null;
  try {
    const [streamsRows, hmuFirstRows, auditResult] = await Promise.all([
      isAllTime ? sql`
        SELECT
          COALESCE(SUM(COALESCE(final_agreed_price, amount, 0)), 0) as ride_fares,
          COALESCE(SUM(COALESCE(add_on_total, 0)), 0) as addon_revenue,
          COALESCE(SUM(CASE WHEN is_cash THEN COALESCE(final_agreed_price, amount, 0) + COALESCE(add_on_total, 0) ELSE 0 END), 0) as cash_total,
          COUNT(*) FILTER (WHERE is_cash = true) as cash_rides,
          COUNT(*) FILTER (WHERE is_cash = false OR is_cash IS NULL) as digital_rides
        FROM rides WHERE status IN ('completed', 'disputed', 'ended')
      ` : sql`
        SELECT
          COALESCE(SUM(COALESCE(final_agreed_price, amount, 0)), 0) as ride_fares,
          COALESCE(SUM(COALESCE(add_on_total, 0)), 0) as addon_revenue,
          COALESCE(SUM(CASE WHEN is_cash THEN COALESCE(final_agreed_price, amount, 0) + COALESCE(add_on_total, 0) ELSE 0 END), 0) as cash_total,
          COUNT(*) FILTER (WHERE is_cash = true) as cash_rides,
          COUNT(*) FILTER (WHERE is_cash = false OR is_cash IS NULL) as digital_rides
        FROM rides WHERE status IN ('completed', 'disputed', 'ended')
          AND created_at > NOW() - ${interval}::interval
      `,
      sql`SELECT COUNT(*)::int as count FROM users WHERE tier = 'hmu_first'`,
      auditFees(period).catch(() => null),
    ]);

    const s = streamsRows[0] ?? {};
    const hmuFirstCount = (hmuFirstRows[0]?.count as number) || 0;

    revenueStreams = {
      rideFares: Number(s.ride_fares ?? 0),
      addonRevenue: Number(s.addon_revenue ?? 0),
      cashTotal: Number(s.cash_total ?? 0),
      cashRides: Number(s.cash_rides ?? 0),
      digitalRides: Number(s.digital_rides ?? 0),
      hmuFirstSubscribers: hmuFirstCount,
      hmuFirstMrr: Math.round(hmuFirstCount * 9.99 * 100) / 100,
    };

    if (auditResult) {
      feeAudit = {
        totalExpectedFees: auditResult.totalExpectedFees,
        totalActualFees: auditResult.totalActualFees,
        totalVariance: auditResult.totalVariance,
        expectedPct: auditResult.expectedPct,
        actualPct: auditResult.actualPct,
        flaggedCount: auditResult.flaggedCount,
      };
    }
  } catch (err) {
    console.error('[money] revenue streams error (non-fatal):', err);
  }

  const m = metrics[0] ?? {};
  const ue = unitEconomics[0] ?? {};
  const cs = cashStats[0] ?? {};

  const gmv = Number(m.gmv ?? 0);
  const platformRevenue = Number(m.platform_revenue ?? 0);
  const stripeFees = Number(m.stripe_fees ?? 0);
  const profit = platformRevenue - stripeFees;
  const margin = gmv > 0 ? (profit / gmv) * 100 : 0;

  return NextResponse.json({
    metrics: {
      gmv,
      platformRevenue,
      feesWaived: Number(m.fees_waived ?? 0),
      stripeFees,
      profit,
      margin: Math.round(margin * 10) / 10,
      driverPayouts: Number(m.driver_payouts ?? 0),
      totalRides: Number(m.total_rides ?? 0),
      failedCaptures: Number(m.failed_captures ?? 0),
      cashRides: Number(m.cash_rides ?? 0),
      cashGmv: Number(m.cash_gmv ?? 0),
      refundsCount: 0,
      refundsSum: 0,
    },
    unitEconomics: {
      avgPrice: Number(ue.avg_price ?? 0),
      avgPlatformFee: Number(ue.avg_platform_fee ?? 0),
      avgStripeFee: Number(ue.avg_stripe_fee ?? 0),
      avgDriverPayout: Number(ue.avg_driver_payout ?? 0),
      avgProfit: Number(ue.avg_platform_fee ?? 0) - Number(ue.avg_stripe_fee ?? 0),
      totalRides: Number(ue.total_rides ?? 0),
    },
    dailyRevenue: dailyRevenue.map((d: Record<string, unknown>) => ({
      day: d.day,
      revenue: Number(d.revenue ?? 0),
      gmv: Number(d.gmv ?? 0),
      stripeFees: Number(d.stripe_fees ?? 0),
      rides: Number(d.rides ?? 0),
    })),
    feeTiers: feeTiers.map((t: Record<string, unknown>) => ({
      tier: t.tier,
      rideCount: Number(t.ride_count ?? 0),
      totalFees: Number(t.total_fees ?? 0),
    })),
    revenueStreams,
    feeAudit,
    period,
  });
}
