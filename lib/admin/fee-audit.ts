// Expected vs Actual fee calculation using the progressive fee schedule from CLAUDE.md
// Free tier: 10% first $50/day, 15% $50-150, 20% $150-300, 25% $300+, $40/day cap, $150/week cap
// HMU First: flat 12%, $25/day cap, $100/week cap

import { sql } from '@/lib/db/client';

interface RideForAudit {
  id: string;
  driver_id: string;
  driver_tier: string;
  ride_date: string;
  ride_amount: number;
  add_on_total: number;
  actual_fee: number;
  stripe_fee: number;
  is_cash: boolean;
  created_at: string;
}

export interface FeeAuditResult {
  rideId: string;
  driverId: string;
  driverTier: string;
  rideGross: number;
  actualFee: number;
  expectedFee: number;
  variance: number;
  flagged: boolean;
}

export interface FeeAuditSummary {
  totalExpectedFees: number;
  totalActualFees: number;
  totalVariance: number;
  expectedPct: number;
  actualPct: number;
  totalGmv: number;
  flaggedCount: number;
  rides: FeeAuditResult[];
}

function calculateExpectedFee(
  rideNetAmount: number,
  driverTier: string,
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number,
): number {
  const DAILY_CAP = driverTier === 'hmu_first' ? 25 : 40;
  const WEEKLY_CAP = driverTier === 'hmu_first' ? 100 : 150;

  const remainingCap = Math.min(
    DAILY_CAP - dailyFeePaid,
    WEEKLY_CAP - weeklyFeePaid,
  );
  if (remainingCap <= 0) return 0;

  let rate: number;
  if (driverTier === 'hmu_first') {
    rate = 0.12;
  } else {
    if (cumulativeDailyEarnings < 50) rate = 0.10;
    else if (cumulativeDailyEarnings < 150) rate = 0.15;
    else if (cumulativeDailyEarnings < 300) rate = 0.20;
    else rate = 0.25;
  }

  return Math.min(rideNetAmount * rate, remainingCap);
}

export async function auditFees(period: string): Promise<FeeAuditSummary> {
  const interval = period === 'weekly' ? '7 days'
    : period === 'daily' ? '1 day'
    : period === 'monthly' ? '30 days'
    : '3650 days';

  const rows = await sql`
    SELECT
      r.id, r.driver_id, u.tier as driver_tier,
      r.created_at::date as ride_date,
      COALESCE(r.final_agreed_price, r.amount, 0) as ride_amount,
      COALESCE(r.add_on_total, 0) as add_on_total,
      COALESCE(r.platform_fee_amount, 0) as actual_fee,
      COALESCE(r.stripe_fee_amount, 0) as stripe_fee,
      COALESCE(r.is_cash, false) as is_cash,
      r.created_at
    FROM rides r
    JOIN users u ON u.id = r.driver_id
    WHERE r.status IN ('completed', 'disputed', 'ended')
      AND r.created_at > NOW() - ${interval}::interval
    ORDER BY r.driver_id, r.created_at ASC
  `;

  const rides = rows as unknown as RideForAudit[];

  // Group by driver+date for progressive calculation
  const results: FeeAuditResult[] = [];
  const driverDailyState: Record<string, { earnings: number; feePaid: number }> = {};
  const driverWeeklyState: Record<string, { feePaid: number; weekStart: string }> = {};

  let totalExpected = 0;
  let totalActual = 0;
  let totalGmv = 0;
  let flaggedCount = 0;

  for (const ride of rides) {
    const rideGross = Number(ride.ride_amount) + Number(ride.add_on_total);
    const stripeFee = Number(ride.stripe_fee);
    const rideNet = rideGross - stripeFee;
    const dateKey = `${ride.driver_id}_${ride.ride_date}`;

    // Get or init daily state
    if (!driverDailyState[dateKey]) {
      driverDailyState[dateKey] = { earnings: 0, feePaid: 0 };
    }

    // Get or init weekly state (reset on new week)
    const weekStart = getWeekStart(ride.ride_date);
    const weekKey = `${ride.driver_id}_${weekStart}`;
    if (!driverWeeklyState[weekKey]) {
      driverWeeklyState[weekKey] = { feePaid: 0, weekStart };
    }

    const daily = driverDailyState[dateKey];
    const weekly = driverWeeklyState[weekKey];

    const expectedFee = calculateExpectedFee(
      rideNet,
      ride.driver_tier || 'free',
      daily.earnings,
      daily.feePaid,
      weekly.feePaid,
    );

    // Update cumulative state
    daily.earnings += rideNet;
    daily.feePaid += expectedFee;
    weekly.feePaid += expectedFee;

    const actualFee = Number(ride.actual_fee);
    const variance = expectedFee - actualFee;
    const flagged = Math.abs(variance) > 0.50;

    if (flagged) flaggedCount++;
    totalExpected += expectedFee;
    totalActual += actualFee;
    totalGmv += rideGross;

    results.push({
      rideId: ride.id,
      driverId: ride.driver_id,
      driverTier: ride.driver_tier || 'free',
      rideGross,
      actualFee,
      expectedFee: Math.round(expectedFee * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      flagged,
    });
  }

  return {
    totalExpectedFees: Math.round(totalExpected * 100) / 100,
    totalActualFees: Math.round(totalActual * 100) / 100,
    totalVariance: Math.round((totalExpected - totalActual) * 100) / 100,
    expectedPct: totalGmv > 0 ? Math.round((totalExpected / totalGmv) * 1000) / 10 : 0,
    actualPct: totalGmv > 0 ? Math.round((totalActual / totalGmv) * 1000) / 10 : 0,
    totalGmv: Math.round(totalGmv * 100) / 100,
    flaggedCount,
    rides: results,
  };
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const weekStart = new Date(d.setDate(diff));
  return weekStart.toISOString().split('T')[0];
}
