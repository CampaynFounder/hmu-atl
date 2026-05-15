// Pure pricing helper for blast fares — wraps the admin-tunable formula in
// one place so /api/blast/estimate, future re-quote endpoints, and unit tests
// all agree.
//
// Formula (every knob admin-tunable via /admin/blast-config):
//
//   minutes = distance_mi / assumed_mph * 60
//   fare    = base_fare + per_mile_rate * distance_mi + per_minute_rate * minutes
//   shown   = clamp(fare, minimum_fare, max_price)
//
// Zeroing any rate collapses to a simpler formula — admins can run base-only,
// per-mile-only, or per-minute-only by setting the unused rate to 0.
//
// Returns whole-dollar suggested price (form's stepper is +$5/-$5) plus a
// breakdown the rider UI can show ("3.2 mi · ~3 min").

export interface BlastPricingInputs {
  /** Trip distance in miles (typically from calculateDistance). */
  distanceMi: number;
  config: {
    base_fare_dollars: number;
    price_per_mile_dollars: number;
    per_minute_cents: number;
    assumed_mph: number;
    minimum_fare_dollars: number;
    max_price_dollars: number;
  };
}

export interface BlastPricingResult {
  /** Whole dollars — matches the form's +$5/-$5 stepper precision. */
  suggestedPriceDollars: number;
  /** Same value in cents for Stripe / DB. */
  suggestedPriceCents: number;
  /** Trip distance rounded to 0.01 mi for display. */
  distanceMi: number;
  /** Trip duration estimate at assumed_mph, rounded to whole minutes. */
  estimatedMinutes: number;
  /** Per-term breakdown for admin preview + future "why this price" UI. */
  breakdown: {
    baseDollars: number;
    perMileDollars: number;
    perMinuteDollars: number;
    rawFareDollars: number;
    flooredAtMinimum: boolean;
    cappedAtMax: boolean;
  };
}

export function computeBlastFare({
  distanceMi,
  config,
}: BlastPricingInputs): BlastPricingResult {
  const safeDistance = Math.max(0, distanceMi);
  const mph = config.assumed_mph > 0 ? config.assumed_mph : 60;
  const rawMinutes = (safeDistance / mph) * 60;

  const baseDollars = config.base_fare_dollars;
  const perMileDollars = config.price_per_mile_dollars * safeDistance;
  const perMinuteDollars = (config.per_minute_cents / 100) * rawMinutes;
  const rawFareDollars = baseDollars + perMileDollars + perMinuteDollars;

  const minimum = config.minimum_fare_dollars;
  const max = config.max_price_dollars;

  let priced = rawFareDollars;
  let flooredAtMinimum = false;
  let cappedAtMax = false;
  if (priced < minimum) {
    priced = minimum;
    flooredAtMinimum = true;
  }
  if (priced > max) {
    priced = max;
    cappedAtMax = true;
  }

  const suggestedPriceDollars = Math.round(priced);
  return {
    suggestedPriceDollars,
    suggestedPriceCents: suggestedPriceDollars * 100,
    distanceMi: Math.round(safeDistance * 100) / 100,
    estimatedMinutes: Math.max(1, Math.round(rawMinutes)),
    breakdown: {
      baseDollars: round2(baseDollars),
      perMileDollars: round2(perMileDollars),
      perMinuteDollars: round2(perMinuteDollars),
      rawFareDollars: round2(rawFareDollars),
      flooredAtMinimum,
      cappedAtMax,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Deposit calc kept alongside the fare formula since both come from the same
// config row and admins tune them together.
export interface BlastDepositInputs {
  fareCents: number;
  config: {
    deposit: {
      default_amount_cents: number;
      percent_of_fare: number;
      max_deposit_cents: number;
    };
  };
}

export function computeBlastDepositCents({
  fareCents,
  config,
}: BlastDepositInputs): number {
  const percent = Math.round(fareCents * config.deposit.percent_of_fare);
  const floored = Math.max(percent, config.deposit.default_amount_cents);
  return Math.min(floored, config.deposit.max_deposit_cents);
}
