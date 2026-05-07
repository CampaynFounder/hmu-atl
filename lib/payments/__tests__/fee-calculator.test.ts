import { describe, it, expect } from 'vitest';
import { calculatePlatformFee, calculateDriverPayout } from '../fee-calculator';

// Tests pin the synchronous code path that runs against in-memory DEFAULTS
// (matching CLAUDE.md spec). The async path that reads from `pricing_config`
// is exercised separately once we have a DB integration test layer.

describe('calculatePlatformFee — free tier progressive rates', () => {
  it('charges 10% on the first $50 of cumulative daily earnings', () => {
    const result = calculatePlatformFee(20, 'free', 0, 0, 0);
    expect(result.rate).toBe(0.10);
    expect(result.fee).toBe(2);
  });

  it('charges 10% at the lower bound (cumulative just under $50)', () => {
    const result = calculatePlatformFee(10, 'free', 49.99, 0, 0);
    expect(result.rate).toBe(0.10);
  });

  it('charges 15% once cumulative crosses $50', () => {
    const result = calculatePlatformFee(20, 'free', 50, 0, 0);
    expect(result.rate).toBe(0.15);
    expect(result.fee).toBe(3);
  });

  it('charges 20% once cumulative crosses $150', () => {
    const result = calculatePlatformFee(20, 'free', 150, 0, 0);
    expect(result.rate).toBe(0.20);
    expect(result.fee).toBe(4);
  });

  it('charges 25% once cumulative crosses $300', () => {
    const result = calculatePlatformFee(20, 'free', 300, 0, 0);
    expect(result.rate).toBe(0.25);
    expect(result.fee).toBe(5);
  });

  it('still charges 25% well past $300', () => {
    const result = calculatePlatformFee(20, 'free', 1000, 0, 0);
    expect(result.rate).toBe(0.25);
    expect(result.fee).toBe(5);
  });
});

describe('calculatePlatformFee — free tier daily cap', () => {
  it('returns fee=0 once dailyFeePaid hits the $40 cap', () => {
    const result = calculatePlatformFee(20, 'free', 1000, 40, 0);
    expect(result.fee).toBe(0);
    expect(result.dailyCapHit).toBe(true);
  });

  it('returns fee=0 if dailyFeePaid is over the cap', () => {
    const result = calculatePlatformFee(20, 'free', 1000, 50, 0);
    expect(result.fee).toBe(0);
  });

  it('caps the fee to remaining cap room when partially used', () => {
    // $35 paid + 25% on $20 = $5 → would land at exactly $40 cap. Verify it does.
    const result = calculatePlatformFee(20, 'free', 1000, 35, 0);
    expect(result.fee).toBe(5);
    expect(result.dailyCapHit).toBe(true);
  });

  it('clamps fee when raw rate would exceed remaining cap', () => {
    // $38 paid leaves $2 of cap; 25% on $20 would be $5; clamp to $2.
    const result = calculatePlatformFee(20, 'free', 1000, 38, 0);
    expect(result.fee).toBe(2);
    expect(result.dailyCapHit).toBe(true);
  });
});

describe('calculatePlatformFee — free tier weekly cap', () => {
  it('returns fee=0 once weeklyFeePaid hits the $150 cap', () => {
    const result = calculatePlatformFee(20, 'free', 1000, 0, 150);
    expect(result.fee).toBe(0);
    expect(result.weeklyCapHit).toBe(true);
  });

  it('weekly cap can clamp before daily cap hits', () => {
    // dailyFeePaid=0 (room=$40), weeklyFeePaid=$148 (room=$2).
    // remainingCap = min(40, 2) = 2.
    const result = calculatePlatformFee(20, 'free', 1000, 0, 148);
    expect(result.fee).toBe(2);
    expect(result.weeklyCapHit).toBe(true);
  });
});

describe('calculatePlatformFee — HMU First flat rate', () => {
  it('charges flat 12% regardless of cumulative earnings', () => {
    expect(calculatePlatformFee(20, 'hmu_first', 0, 0, 0).rate).toBe(0.12);
    expect(calculatePlatformFee(20, 'hmu_first', 500, 0, 0).rate).toBe(0.12);
  });

  it('returns tier label "HMU First"', () => {
    expect(calculatePlatformFee(20, 'hmu_first', 0, 0, 0).tierLabel).toBe('HMU First');
  });

  it('caps daily at $25', () => {
    const result = calculatePlatformFee(20, 'hmu_first', 0, 25, 0);
    expect(result.fee).toBe(0);
    expect(result.dailyCapHit).toBe(true);
  });

  it('caps weekly at $100', () => {
    const result = calculatePlatformFee(20, 'hmu_first', 0, 0, 100);
    expect(result.fee).toBe(0);
    expect(result.weeklyCapHit).toBe(true);
  });
});

describe('calculatePlatformFee — labels and edge cases', () => {
  it('returns tier label "Free" for free tier', () => {
    expect(calculatePlatformFee(20, 'free', 0, 0, 0).tierLabel).toBe('Free');
  });

  it('returns fee=0 for a $0 ride', () => {
    expect(calculatePlatformFee(0, 'free', 0, 0, 0).fee).toBe(0);
  });
});

describe('calculateDriverPayout — full money flow', () => {
  it('subtracts Stripe fee then platform fee in order', () => {
    // $20 ride, free tier, fresh day.
    // Stripe fee: 20 * 0.029 + 0.30 = 0.88
    // Net after Stripe: 19.12
    // Platform fee: 19.12 * 0.10 = 1.912 → 1.91
    // Driver receives: 19.12 - 1.91 = 17.21
    // Platform total: 0.88 + 1.91 = 2.79
    const result = calculateDriverPayout(20, 'free', 0, 0, 0);
    expect(result.stripeFee).toBe(0.88);
    expect(result.platformFee).toBe(1.91);
    expect(result.driverReceives).toBe(17.21);
    expect(result.platformReceives).toBe(2.79);
  });

  it('hits cap on a high-earning day and zeroes platform fee', () => {
    // dailyFeePaid already at cap → platformFee=0 → driver keeps net-after-Stripe.
    const result = calculateDriverPayout(20, 'free', 1000, 40, 0);
    expect(result.platformFee).toBe(0);
    expect(result.dailyCapHit).toBe(true);
    expect(result.driverReceives).toBe(19.12);
  });

  it('matches CLAUDE.md viral-moment numbers — driver keeps everything when capped', () => {
    // Spec says "You kept $20.00, HMU took $0.00" when daily cap is hit.
    // We model that as platformFee=0; driver keeps the net-after-Stripe amount.
    const result = calculateDriverPayout(20, 'free', 1000, 40, 0);
    expect(result.platformFee).toBe(0);
  });
});
