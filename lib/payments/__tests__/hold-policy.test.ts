import { describe, it, expect } from 'vitest';
import {
  calculateDepositAmount,
  calculateCancelSplit,
  calculateNoShowSplit,
  type HoldPolicy,
} from '../hold-policy';

const freeDefault: HoldPolicy = {
  id: 'free',
  tier: 'free',
  holdMode: 'deposit_percent',
  holdPercent: 0.25,
  holdFixed: null,
  holdMinimum: 5,
  cancelBeforeOtwRefundPct: 1.0,
  cancelAfterOtwDriverPct: 1.0,
  cancelAfterOtwPlatformPct: 0,
  noShowPlatformTiers: [
    { up_to: 15, rate: 0.05 },
    { up_to: 30, rate: 0.10 },
    { up_to: 60, rate: 0.15 },
    { above: 60, rate: 0.20 },
  ],
  effectiveFrom: '2026-04-13',
  effectiveTo: null,
  changeReason: null,
  isActive: true,
  createdAt: '',
};

describe('calculateDepositAmount — deposit_percent mode', () => {
  it('takes 25% of ride price when above minimum', () => {
    const result = calculateDepositAmount(100, 10, freeDefault);
    expect(result.visibleDeposit).toBe(25);
    expect(result.stripeAuthAmount).toBe(110); // ride + add-on reserve
  });

  it('floors at the minimum on small fares', () => {
    const result = calculateDepositAmount(10, 0, freeDefault);
    expect(result.visibleDeposit).toBe(5);
    expect(result.stripeAuthAmount).toBe(10);
  });

  it('clamps deposit to ride price when minimum exceeds it', () => {
    const result = calculateDepositAmount(4, 0, freeDefault);
    expect(result.visibleDeposit).toBe(4);
    expect(result.stripeAuthAmount).toBe(4);
  });

  it('always authorizes ride + add-on, even when visible deposit is small', () => {
    const result = calculateDepositAmount(20, 5, freeDefault);
    expect(result.stripeAuthAmount).toBe(25);
    expect(result.visibleDeposit).toBe(5); // 25% of 20 = 5, equals min
  });
});

describe('calculateDepositAmount — deposit_fixed mode', () => {
  it('uses the fixed amount', () => {
    const policy: HoldPolicy = { ...freeDefault, holdMode: 'deposit_fixed', holdFixed: 7 };
    const result = calculateDepositAmount(100, 0, policy);
    expect(result.visibleDeposit).toBe(7);
  });

  it('caps fixed deposit at ride price', () => {
    const policy: HoldPolicy = { ...freeDefault, holdMode: 'deposit_fixed', holdFixed: 50 };
    const result = calculateDepositAmount(20, 0, policy);
    expect(result.visibleDeposit).toBe(20);
  });
});

describe('calculateDepositAmount — full mode', () => {
  it('shows the full ride price as deposit', () => {
    const policy: HoldPolicy = { ...freeDefault, holdMode: 'full' };
    const result = calculateDepositAmount(40, 5, policy);
    expect(result.visibleDeposit).toBe(40);
    expect(result.stripeAuthAmount).toBe(45);
  });
});

describe('calculateCancelSplit — before OTW', () => {
  it('refunds 100% by default — rider unharmed for early cancel', () => {
    const result = calculateCancelSplit(25, 'before_otw', freeDefault);
    expect(result.riderRefunded).toBe(25);
    expect(result.riderCharged).toBe(0);
    expect(result.driverReceives).toBe(0);
    expect(result.platformReceives).toBe(0);
  });

  it('partial refund routes the kept amount to driver, not platform', () => {
    const policy: HoldPolicy = { ...freeDefault, cancelBeforeOtwRefundPct: 0.5 };
    const result = calculateCancelSplit(20, 'before_otw', policy);
    expect(result.riderRefunded).toBe(10);
    expect(result.riderCharged).toBe(10);
    expect(result.driverReceives).toBe(10);
    expect(result.platformReceives).toBe(0);
  });
});

describe('calculateCancelSplit — after OTW', () => {
  it('default policy gives driver 100% — gas money', () => {
    const result = calculateCancelSplit(25, 'after_otw', freeDefault);
    expect(result.driverReceives).toBe(25);
    expect(result.platformReceives).toBe(0);
    expect(result.riderRefunded).toBe(0);
  });

  it('respects custom driver/platform split', () => {
    const policy: HoldPolicy = {
      ...freeDefault,
      cancelAfterOtwDriverPct: 0.7,
      cancelAfterOtwPlatformPct: 0.2,
    };
    const result = calculateCancelSplit(20, 'after_otw', policy);
    expect(result.driverReceives).toBe(14);
    expect(result.platformReceives).toBe(4);
    expect(result.riderRefunded).toBe(2);
  });
});

describe('calculateNoShowSplit — progressive marginal tiers', () => {
  it('charges 5% on a small fare entirely within tier 1', () => {
    const result = calculateNoShowSplit(10, freeDefault);
    expect(result.platformReceives).toBe(0.5);
    expect(result.driverReceives).toBe(9.5);
    expect(result.riderCharged).toBe(10);
  });

  it('marginal split across two tiers ($20 fare)', () => {
    // First $15 @ 5% = 0.75; next $5 @ 10% = 0.50; platform=1.25, driver=18.75
    const result = calculateNoShowSplit(20, freeDefault);
    expect(result.platformReceives).toBe(1.25);
    expect(result.driverReceives).toBe(18.75);
  });

  it('marginal split across three tiers ($50 fare)', () => {
    // 15*0.05 + 15*0.10 + 20*0.15 = 0.75 + 1.50 + 3.00 = 5.25
    const result = calculateNoShowSplit(50, freeDefault);
    expect(result.platformReceives).toBe(5.25);
    expect(result.driverReceives).toBe(44.75);
  });

  it('uses the "above" tier for amounts past the final ceiling ($100 fare)', () => {
    // 15*0.05 + 15*0.10 + 30*0.15 + 40*0.20 = 0.75+1.50+4.50+8.00 = 14.75
    const result = calculateNoShowSplit(100, freeDefault);
    expect(result.platformReceives).toBe(14.75);
    expect(result.driverReceives).toBe(85.25);
    expect(result.tierBreakdown).toHaveLength(4);
  });

  it('returns effective rate as a fraction of total fare', () => {
    const result = calculateNoShowSplit(100, freeDefault);
    expect(result.effectiveRate).toBeCloseTo(0.1475, 4);
  });

  it('falls back to driver-takes-all when no tiers are configured', () => {
    const policy: HoldPolicy = { ...freeDefault, noShowPlatformTiers: [] };
    const result = calculateNoShowSplit(50, policy);
    expect(result.platformReceives).toBe(0);
    expect(result.driverReceives).toBe(50);
  });

  it('handles a zero-dollar ride without dividing by zero', () => {
    const result = calculateNoShowSplit(0, freeDefault);
    expect(result.platformReceives).toBe(0);
    expect(result.driverReceives).toBe(0);
    expect(result.effectiveRate).toBe(0);
  });
});

describe('calculateNoShowSplit — HMU First custom tiers', () => {
  it('uses lower platform rates than free tier', () => {
    const hmuFirst: HoldPolicy = {
      ...freeDefault,
      tier: 'hmu_first',
      noShowPlatformTiers: [
        { up_to: 15, rate: 0.05 },
        { up_to: 30, rate: 0.08 },
        { up_to: 60, rate: 0.12 },
        { above: 60, rate: 0.15 },
      ],
    };
    // 15*0.05 + 15*0.08 + 30*0.12 + 40*0.15 = 0.75 + 1.20 + 3.60 + 6.00 = 11.55
    const result = calculateNoShowSplit(100, hmuFirst);
    expect(result.platformReceives).toBe(11.55);
    expect(result.driverReceives).toBe(88.45);
  });
});
