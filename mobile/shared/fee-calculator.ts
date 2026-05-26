// Pure fee calculator — no server dependencies. Uses hardcoded defaults.
// Async variant (getPricingConfig from DB) is server-only; this module is safe for RN.

export interface FeeResult {
  fee: number;
  rate: number;
  dailyCapHit: boolean;
  weeklyCapHit: boolean;
  tierLabel: string;
}

export interface PayoutResult {
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

export function calculatePlatformFee(
  rideNetAmount: number,
  tier: 'free' | 'hmu_first',
  cumulativeDailyEarnings: number,
  dailyFeePaid: number,
  weeklyFeePaid: number,
): FeeResult {
  const config = DEFAULTS[tier] ?? DEFAULTS.free;
  const remainingCap = Math.min(
    config.dailyCap - dailyFeePaid,
    config.weeklyCap - weeklyFeePaid,
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

  let rate = config.feeRate;
  if (config.progressiveThresholds?.length) {
    for (const t of config.progressiveThresholds) {
      if (t.below && cumulativeDailyEarnings < t.below) { rate = t.rate; break; }
      if (t.above && cumulativeDailyEarnings >= t.above) { rate = t.rate; break; }
    }
  }
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
  weeklyFeePaid: number,
): PayoutResult {
  const stripeFee = Math.round((rideAmount * 0.029 + 0.30) * 100) / 100;
  const rideNetAmount = rideAmount - stripeFee;
  const { fee: platformFee, dailyCapHit, weeklyCapHit, tierLabel } = calculatePlatformFee(
    rideNetAmount, tier, cumulativeDailyEarnings, dailyFeePaid, weeklyFeePaid,
  );
  const driverReceives = Math.round((rideNetAmount - platformFee) * 100) / 100;
  const platformReceives = Math.round((stripeFee + platformFee) * 100) / 100;
  return { rideAmount, stripeFee, platformFee, driverReceives, platformReceives, dailyCapHit, weeklyCapHit, tierLabel };
}
