import { sql } from '@/lib/db/client';

interface FeeResult {
  fee: number;
  rate: number;
  dailyCapHit: boolean;
  weeklyCapHit: boolean;
  tierLabel: string;
}

interface PayoutResult {
  rideAmount: number;
  stripeFee: number;
  platformFee: number;
  driverReceives: number;
  platformReceives: number;
  dailyCapHit: boolean;
  weeklyCapHit: boolean;
  tierLabel: string;
}

export function calculatePlatformFee(
  rideNetAmount: number,
  tier: 'free' | 'hmu_first',
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number
): FeeResult {
  const DAILY_CAP = tier === 'hmu_first' ? 25 : 40;
  const WEEKLY_CAP = tier === 'hmu_first' ? 100 : 150;

  const remainingCap = Math.min(
    DAILY_CAP - dailyFeePaid,
    WEEKLY_CAP - weeklyFeePaid
  );

  if (remainingCap <= 0) {
    return {
      fee: 0,
      rate: 0,
      dailyCapHit: dailyFeePaid >= DAILY_CAP,
      weeklyCapHit: weeklyFeePaid >= WEEKLY_CAP,
      tierLabel: tier === 'hmu_first' ? 'HMU First' : 'Free',
    };
  }

  let rate: number;
  if (tier === 'hmu_first') {
    rate = 0.12;
  } else {
    if (cumulativeDailyEarnings < 50) rate = 0.10;
    else if (cumulativeDailyEarnings < 150) rate = 0.15;
    else if (cumulativeDailyEarnings < 300) rate = 0.20;
    else rate = 0.25;
  }

  const fee = Math.min(rideNetAmount * rate, remainingCap);

  return {
    fee: Math.round(fee * 100) / 100,
    rate,
    dailyCapHit: (dailyFeePaid + fee) >= DAILY_CAP,
    weeklyCapHit: (weeklyFeePaid + fee) >= WEEKLY_CAP,
    tierLabel: tier === 'hmu_first' ? 'HMU First' : 'Free',
  };
}

export function calculateDriverPayout(
  rideAmount: number,
  tier: 'free' | 'hmu_first',
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number
): PayoutResult {
  // Stripe processing fee (platform absorbs)
  const stripeFee = Math.round((rideAmount * 0.029 + 0.30) * 100) / 100;
  const rideNetAmount = rideAmount - stripeFee;

  const { fee: platformFee, dailyCapHit, weeklyCapHit, tierLabel } = calculatePlatformFee(
    rideNetAmount,
    tier,
    cumulativeDailyEarnings,
    dailyFeePaid,
    weeklyFeePaid
  );

  const driverReceives = Math.round((rideNetAmount - platformFee) * 100) / 100;
  const platformReceives = Math.round((stripeFee + platformFee) * 100) / 100;

  return {
    rideAmount,
    stripeFee,
    platformFee,
    driverReceives,
    platformReceives,
    dailyCapHit,
    weeklyCapHit,
    tierLabel,
  };
}

export async function getDailyEarnings(driverId: string): Promise<{
  cumulativeDailyEarnings: number;
  dailyFeePaid: number;
  weeklyFeePaid: number;
}> {
  const todayRows = await sql`
    SELECT gross_earnings, platform_fee_paid
    FROM daily_earnings
    WHERE driver_id = ${driverId}
      AND earnings_date = (NOW() AT TIME ZONE 'America/New_York')::date
    LIMIT 1
  `;

  const weekRows = await sql`
    SELECT COALESCE(SUM(platform_fee_paid), 0) as weekly_fee
    FROM daily_earnings
    WHERE driver_id = ${driverId}
      AND earnings_date >= date_trunc('week', (NOW() AT TIME ZONE 'America/New_York')::date)
  `;

  const today = todayRows[0] as Record<string, unknown> | undefined;
  const week = weekRows[0] as Record<string, unknown> | undefined;

  return {
    cumulativeDailyEarnings: Number(today?.gross_earnings ?? 0),
    dailyFeePaid: Number(today?.platform_fee_paid ?? 0),
    weeklyFeePaid: Number(week?.weekly_fee ?? 0),
  };
}
