import { describe, expect, it } from 'vitest';
import { computeBlastFare, computeBlastDepositCents } from '../pricing';

// Mirrors MATCHING_DEFAULTS.pricing in lib/blast/config.ts — keep in sync if
// the seed values change. Captures the user-specified formula:
//   $3 base + $2/mi + 10¢/min @ 60mph, $5 minimum, $200 max.
const DEFAULT_PRICING = {
  base_fare_dollars: 3.0,
  price_per_mile_dollars: 2.0,
  per_minute_cents: 10,
  assumed_mph: 60,
  minimum_fare_dollars: 5.0,
  max_price_dollars: 200,
};

describe('computeBlastFare', () => {
  it('returns minimum fare for a zero-distance trip', () => {
    const r = computeBlastFare({ distanceMi: 0, config: DEFAULT_PRICING });
    expect(r.suggestedPriceDollars).toBe(5);
    expect(r.breakdown.flooredAtMinimum).toBe(true);
    expect(r.breakdown.cappedAtMax).toBe(false);
  });

  it('floors a short trip below minimum to the minimum', () => {
    // 0.4 mi → $3 + 0.8 + 0.04 = $3.84 < $5 → floored
    const r = computeBlastFare({ distanceMi: 0.4, config: DEFAULT_PRICING });
    expect(r.breakdown.rawFareDollars).toBeCloseTo(3.84, 2);
    expect(r.suggestedPriceDollars).toBe(5);
    expect(r.breakdown.flooredAtMinimum).toBe(true);
  });

  it('matches the spec example: 3.2 mi at default rates ≈ $9.72 → rounded to $10', () => {
    // $3 + $2*3.2 + $0.10*3.2 = $9.72 → round to nearest dollar = $10
    const r = computeBlastFare({ distanceMi: 3.2, config: DEFAULT_PRICING });
    expect(r.breakdown.rawFareDollars).toBeCloseTo(9.72, 2);
    expect(r.suggestedPriceDollars).toBe(10);
    expect(r.estimatedMinutes).toBe(3);
    expect(r.breakdown.flooredAtMinimum).toBe(false);
    expect(r.breakdown.cappedAtMax).toBe(false);
  });

  it('caps a very long trip at the max price', () => {
    // 200 mi → $3 + $400 + $20 = $423 → capped to $200
    const r = computeBlastFare({ distanceMi: 200, config: DEFAULT_PRICING });
    expect(r.suggestedPriceDollars).toBe(200);
    expect(r.breakdown.cappedAtMax).toBe(true);
    expect(r.breakdown.flooredAtMinimum).toBe(false);
  });

  it('respects per-minute term when assumed_mph drops (urban driving)', () => {
    // 5 mi @ 30mph = 10 minutes vs 5 min @ 60mph.
    // At default rates: $3 + $10 + $1.00 = $14 (vs $3 + $10 + $0.50 = $13.50)
    const urban = computeBlastFare({
      distanceMi: 5,
      config: { ...DEFAULT_PRICING, assumed_mph: 30 },
    });
    const highway = computeBlastFare({
      distanceMi: 5,
      config: DEFAULT_PRICING,
    });
    // Compare pre-round fares — at $0.10/min, the 5-minute delta is $0.50,
    // which would collapse to the same rounded dollar in some cases.
    expect(urban.breakdown.rawFareDollars).toBeGreaterThan(highway.breakdown.rawFareDollars);
    expect(urban.estimatedMinutes).toBe(10);
    expect(highway.estimatedMinutes).toBe(5);
  });

  it('collapses to base + minimum when both rates are zero', () => {
    const r = computeBlastFare({
      distanceMi: 10,
      config: { ...DEFAULT_PRICING, price_per_mile_dollars: 0, per_minute_cents: 0 },
    });
    // Raw = $3 base, floored to $5.
    expect(r.suggestedPriceDollars).toBe(5);
    expect(r.breakdown.flooredAtMinimum).toBe(true);
  });

  it('collapses to per-minute-only when per-mile is zero', () => {
    const r = computeBlastFare({
      distanceMi: 30, // 30 min @ 60mph
      config: { ...DEFAULT_PRICING, price_per_mile_dollars: 0 },
    });
    // $3 + $0 + 30 * 0.10 = $6
    expect(r.breakdown.rawFareDollars).toBeCloseTo(6, 2);
    expect(r.suggestedPriceDollars).toBe(6);
  });

  it('treats negative distance as zero (defensive)', () => {
    const r = computeBlastFare({ distanceMi: -3, config: DEFAULT_PRICING });
    expect(r.distanceMi).toBe(0);
    expect(r.suggestedPriceDollars).toBe(5);
  });

  it('falls back to 60mph if assumed_mph is zero or negative', () => {
    const r = computeBlastFare({
      distanceMi: 60,
      config: { ...DEFAULT_PRICING, assumed_mph: 0 },
    });
    // Should not crash with div-by-zero; fallback 60mph → 60min → $6 from time
    expect(r.estimatedMinutes).toBe(60);
    expect(Number.isFinite(r.suggestedPriceDollars)).toBe(true);
  });
});

describe('computeBlastDepositCents', () => {
  const cfg = {
    deposit: {
      default_amount_cents: 500, // $5 floor
      percent_of_fare: 0.5,
      max_deposit_cents: 5000, // $50 ceiling
    },
  };

  it('floors short-fare deposits at the default amount', () => {
    // $6 fare * 50% = $3, floored to $5
    expect(computeBlastDepositCents({ fareCents: 600, config: cfg })).toBe(500);
  });

  it('uses percent for mid-range fares', () => {
    // $40 fare * 50% = $20
    expect(computeBlastDepositCents({ fareCents: 4000, config: cfg })).toBe(2000);
  });

  it('caps at max for big-fare deposits', () => {
    // $200 fare * 50% = $100, capped to $50
    expect(computeBlastDepositCents({ fareCents: 20000, config: cfg })).toBe(5000);
  });
});
