import { describe, it, expect } from 'vitest';
import { computeDeliverySplit, DEFAULT_FEE_POLICY, type FeePolicy } from '@/lib/partner/fees';

const percent = (bps: number, overrides: Partial<FeePolicy> = {}): FeePolicy => ({
  ...DEFAULT_FEE_POLICY,
  commission_mode: 'percent',
  commission_bps: bps,
  min_commission_cents: 0,
  ...overrides,
});

describe('computeDeliverySplit — percent mode', () => {
  it('takes the configured percentage of the delivery fee', () => {
    const s = computeDeliverySplit({ deliveryFeeCents: 800, policy: percent(1500) });
    expect(s.platformFeeCents).toBe(120); // 15% of $8.00
    expect(s.driverPayoutCents).toBe(680);
    expect(s.totalChargeCents).toBe(800);
  });

  it('passes tips through 100% to the driver by default', () => {
    const s = computeDeliverySplit({ deliveryFeeCents: 800, tipCents: 150, policy: percent(1500) });
    expect(s.platformFeeCents).toBe(120); // commission unchanged by tip
    expect(s.driverPayoutCents).toBe(800 + 150 - 120); // 830
    expect(s.totalChargeCents).toBe(950);
  });

  it('commissions tips only when tip_takes_commission is on', () => {
    const s = computeDeliverySplit({
      deliveryFeeCents: 800,
      tipCents: 200,
      policy: percent(1500, { tip_takes_commission: true }),
    });
    expect(s.platformFeeCents).toBe(120 + 30); // 15% of $8 + 15% of $2
    expect(s.driverPayoutCents).toBe(1000 - 150);
  });

  it('enforces the minimum commission floor', () => {
    const s = computeDeliverySplit({
      deliveryFeeCents: 300,
      policy: percent(1000, { min_commission_cents: 100 }),
    });
    // 10% of $3 = 30¢, floored to 100¢
    expect(s.platformFeeCents).toBe(100);
    expect(s.driverPayoutCents).toBe(200);
  });
});

describe('computeDeliverySplit — flat mode', () => {
  it('takes a fixed per-delivery fee regardless of size', () => {
    const policy: FeePolicy = { ...DEFAULT_FEE_POLICY, commission_mode: 'flat', commission_flat_cents: 250 };
    const s = computeDeliverySplit({ deliveryFeeCents: 800, policy });
    expect(s.platformFeeCents).toBe(250);
    expect(s.driverPayoutCents).toBe(550);
  });

  it('never charges more flat fee than the delivery fee itself', () => {
    const policy: FeePolicy = { ...DEFAULT_FEE_POLICY, commission_mode: 'flat', commission_flat_cents: 250 };
    const s = computeDeliverySplit({ deliveryFeeCents: 200, policy });
    expect(s.platformFeeCents).toBe(200);
    expect(s.driverPayoutCents).toBe(0);
  });

  it('does not double the flat fee onto the tip', () => {
    const policy: FeePolicy = {
      ...DEFAULT_FEE_POLICY,
      commission_mode: 'flat',
      commission_flat_cents: 250,
      tip_takes_commission: true,
    };
    const s = computeDeliverySplit({ deliveryFeeCents: 800, tipCents: 300, policy });
    expect(s.platformFeeCents).toBe(250); // flat only, tip untouched
    expect(s.driverPayoutCents).toBe(850);
  });
});

describe('computeDeliverySplit — none mode', () => {
  it('gives the driver the entire fee and tip', () => {
    const policy: FeePolicy = { ...DEFAULT_FEE_POLICY, commission_mode: 'none' };
    const s = computeDeliverySplit({ deliveryFeeCents: 800, tipCents: 200, policy });
    expect(s.platformFeeCents).toBe(0);
    expect(s.driverPayoutCents).toBe(1000);
  });
});

describe('computeDeliverySplit — edge cases', () => {
  it('handles a zero delivery fee', () => {
    const s = computeDeliverySplit({ deliveryFeeCents: 0, policy: percent(1500) });
    expect(s.platformFeeCents).toBe(0);
    expect(s.driverPayoutCents).toBe(0);
    expect(s.estimatedStripeFeeCents).toBe(0);
  });

  it('clamps negative inputs to zero', () => {
    const s = computeDeliverySplit({ deliveryFeeCents: -500, tipCents: -100, policy: percent(1500) });
    expect(s.totalChargeCents).toBe(0);
    expect(s.driverPayoutCents).toBe(0);
  });

  it('estimates the Stripe fee on the full charge', () => {
    const s = computeDeliverySplit({ deliveryFeeCents: 1000, tipCents: 0, policy: percent(1500) });
    expect(s.estimatedStripeFeeCents).toBe(Math.round(1000 * 0.029) + 30); // 59
  });
});
