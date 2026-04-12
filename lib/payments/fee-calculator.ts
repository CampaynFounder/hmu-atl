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

interface PricingConfig {
  feeRate: number;
  dailyCap: number;
  weeklyCap: number;
  progressiveThresholds: { below?: number; above?: number; rate: number }[] | null;
  peakMultiplier: number;
}

// In-memory cache for pricing config — refreshed every 60s
let configCache: Map<string, PricingConfig> = new Map();
let configCacheTime = 0;
const CACHE_TTL_MS = 60000;

// Default fallback values (match CLAUDE.md spec)
const DEFAULTS: Record<string, PricingConfig> = {
  free: {
    feeRate: 0.10,
    dailyCap: 40,
    weeklyCap: 150,
    progressiveThresholds: [
      { below: 50, rate: 0.10 },
      { below: 150, rate: 0.15 },
      { below: 300, rate: 0.20 },
      { above: 300, rate: 0.25 },
    ],
    peakMultiplier: 1,
  },
  hmu_first: {
    feeRate: 0.12,
    dailyCap: 25,
    weeklyCap: 100,
    progressiveThresholds: null,
    peakMultiplier: 1,
  },
};

async function getPricingConfig(tier: string): Promise<PricingConfig> {
  // Return from cache if fresh
  if (Date.now() - configCacheTime < CACHE_TTL_MS && configCache.has(tier)) {
    return configCache.get(tier)!;
  }

  try {
    const rows = await sql`
      SELECT fee_rate, daily_cap, weekly_cap, progressive_thresholds, peak_multiplier
      FROM pricing_config
      WHERE tier = ${tier} AND is_active = true
        AND effective_from <= CURRENT_DATE
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY effective_from DESC
      LIMIT 1
    `;

    if (rows.length > 0) {
      const r = rows[0] as Record<string, unknown>;
      const config: PricingConfig = {
        feeRate: Number(r.fee_rate),
        dailyCap: Number(r.daily_cap),
        weeklyCap: Number(r.weekly_cap),
        progressiveThresholds: r.progressive_thresholds as PricingConfig['progressiveThresholds'],
        peakMultiplier: Number(r.peak_multiplier ?? 1),
      };
      configCache.set(tier, config);
      configCacheTime = Date.now();
      return config;
    }
  } catch (err) {
    console.error('Failed to load pricing config, using defaults:', err);
  }

  // Fallback to defaults
  return DEFAULTS[tier] || DEFAULTS.free;
}

export async function calculatePlatformFeeAsync(
  rideNetAmount: number,
  tier: 'free' | 'hmu_first',
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number
): Promise<FeeResult> {
  const config = await getPricingConfig(tier);
  return calculatePlatformFeeWithConfig(rideNetAmount, tier, cumulativeDailyEarnings, dailyFeePaid, weeklyFeePaid, config);
}

// Synchronous version using defaults (for backwards compat)
export function calculatePlatformFee(
  rideNetAmount: number,
  tier: 'free' | 'hmu_first',
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number
): FeeResult {
  const config = configCache.get(tier) || DEFAULTS[tier] || DEFAULTS.free;
  return calculatePlatformFeeWithConfig(rideNetAmount, tier, cumulativeDailyEarnings, dailyFeePaid, weeklyFeePaid, config);
}

function calculatePlatformFeeWithConfig(
  rideNetAmount: number,
  tier: 'free' | 'hmu_first',
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number,
  config: PricingConfig
): FeeResult {
  const remainingCap = Math.min(
    config.dailyCap - dailyFeePaid,
    config.weeklyCap - weeklyFeePaid
  );

  if (remainingCap <= 0) {
    return {
      fee: 0,
      rate: 0,
      dailyCapHit: dailyFeePaid >= config.dailyCap,
      weeklyCapHit: weeklyFeePaid >= config.weeklyCap,
      tierLabel: tier === 'hmu_first' ? 'HMU First' : 'Free',
    };
  }

  let rate: number;
  if (config.progressiveThresholds?.length) {
    // Progressive rates based on cumulative daily earnings
    rate = config.feeRate; // default
    for (const t of config.progressiveThresholds) {
      if (t.below && cumulativeDailyEarnings < t.below) { rate = t.rate; break; }
      if (t.above && cumulativeDailyEarnings >= t.above) { rate = t.rate; break; }
    }
  } else {
    rate = config.feeRate;
  }

  // Apply peak multiplier
  rate = rate * config.peakMultiplier;

  const fee = Math.min(rideNetAmount * rate, remainingCap);

  return {
    fee: Math.round(fee * 100) / 100,
    rate,
    dailyCapHit: (dailyFeePaid + fee) >= config.dailyCap,
    weeklyCapHit: (weeklyFeePaid + fee) >= config.weeklyCap,
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
  const stripeFee = Math.round((rideAmount * 0.029 + 0.30) * 100) / 100;
  const rideNetAmount = rideAmount - stripeFee;

  const { fee: platformFee, dailyCapHit, weeklyCapHit, tierLabel } = calculatePlatformFee(
    rideNetAmount, tier, cumulativeDailyEarnings, dailyFeePaid, weeklyFeePaid
  );

  const driverReceives = Math.round((rideNetAmount - platformFee) * 100) / 100;
  const platformReceives = Math.round((stripeFee + platformFee) * 100) / 100;

  return { rideAmount, stripeFee, platformFee, driverReceives, platformReceives, dailyCapHit, weeklyCapHit, tierLabel };
}

export function calculateFullBreakdown(
  rideAmount: number,
  tier: 'free' | 'hmu_first',
  payoutMethod: string,
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number
): {
  rideAmount: number;
  stripeFee: number;
  netAfterStripe: number;
  platformFee: number;
  dotsPayoutFee: number;
  driverReceives: number;
  platformReceives: number;
  dailyCapHit: boolean;
  weeklyCapHit: boolean;
  tierLabel: string;
  nextTierAt: number | null;
} {
  const config = configCache.get(tier) || DEFAULTS[tier] || DEFAULTS.free;
  const stripeFee = Math.round((rideAmount * 0.029 + 0.30) * 100) / 100;
  const netAfterStripe = rideAmount - stripeFee;

  const { fee: platformFee, rate, dailyCapHit, weeklyCapHit, tierLabel } = calculatePlatformFeeWithConfig(
    netAfterStripe, tier, cumulativeDailyEarnings, dailyFeePaid, weeklyFeePaid, config
  );

  let dotsPayoutFee = 0;
  if (payoutMethod === 'debit') dotsPayoutFee = netAfterStripe * 0.005;
  else if (payoutMethod === 'paypal') dotsPayoutFee = netAfterStripe * 0.01;
  dotsPayoutFee = Math.round(dotsPayoutFee * 100) / 100;

  const driverReceives = Math.round((netAfterStripe - platformFee - dotsPayoutFee) * 100) / 100;
  const platformReceives = Math.round((stripeFee + platformFee + dotsPayoutFee) * 100) / 100;

  let nextTierAt: number | null = null;
  if (tier === 'free' && config.progressiveThresholds?.length) {
    for (const t of config.progressiveThresholds) {
      if (t.below && cumulativeDailyEarnings < t.below) { nextTierAt = t.below; break; }
    }
  }

  return {
    rideAmount, stripeFee, netAfterStripe, platformFee, dotsPayoutFee,
    driverReceives, platformReceives, dailyCapHit, weeklyCapHit, tierLabel, nextTierAt,
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
