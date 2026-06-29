import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql, pool: null, transaction: vi.fn() }));

// Mock getPaymentsConfig so tests control config without depending on sql format.
const mockGetPaymentsConfig = vi.hoisted(() => vi.fn());
vi.mock('@/lib/payments/config', () => ({
  getPaymentsConfig: mockGetPaymentsConfig,
  computeAddOnReserve: vi.fn().mockReturnValue(0),
  PAYMENTS_DEFAULTS: {},
}));

import {
  DepositOnlyStrategy,
  depositOnlyStrategy,
  clampDeposit,
  calculateDepositFeeCents,
  getDepositOnlyConfig,
  _clearDepositOnlyConfigCache,
  DEFAULT_DEPOSIT_ONLY_CONFIG,
} from '../strategies/deposit-only';

beforeEach(() => {
  sql.mockReset();
  _clearDepositOnlyConfigCache();
  mockGetPaymentsConfig.mockResolvedValue({ depositOnly: DEFAULT_DEPOSIT_ONLY_CONFIG });
});

describe('clampDeposit', () => {
  it('snaps a small request up to the configured minimum', () => {
    expect(clampDeposit(2, 20, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(5);
  });

  it('caps a large request at 50% of total fare', () => {
    expect(clampDeposit(50, 20, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(10);
  });

  it('rounds to the nearest $1 increment', () => {
    expect(clampDeposit(7.6, 20, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(8);
    expect(clampDeposit(7.4, 20, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(7);
  });

  it('accepts a request inside the bounds verbatim after rounding', () => {
    expect(clampDeposit(8, 20, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(8);
  });

  it('handles a tiny total fare gracefully (deposit = total)', () => {
    expect(clampDeposit(100, 3, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(3);
  });

  it('honors a driver floor below the platform min (lower of the two)', () => {
    // floorOverride below the $5 platform default lowers the effective minimum.
    expect(clampDeposit(3, 20, DEFAULT_DEPOSIT_ONLY_CONFIG, 3)).toBe(3);
  });

  it('does not let a driver floor ABOVE the platform min reduce a higher request', () => {
    // A $10 floor with a $10 request still yields $10 (min(5,10)=5 floor, request wins).
    expect(clampDeposit(10, 40, DEFAULT_DEPOSIT_ONLY_CONFIG, 10)).toBe(10);
  });
});

describe('calculateDepositFeeCents', () => {
  it('charges the floor when 20% would be less', () => {
    // $5 deposit → 20% = $1.00; floor $1.50 wins.
    expect(calculateDepositFeeCents(500, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(150);
  });

  it('charges the floor at the breakeven point ($7.50)', () => {
    // 20% of 750 = 150; max(150, 150) = 150.
    expect(calculateDepositFeeCents(750, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(150);
  });

  it('charges 20% above the breakeven point', () => {
    // 20% of 1000 = 200.
    expect(calculateDepositFeeCents(1000, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(200);
    // 20% of 2000 = 400.
    expect(calculateDepositFeeCents(2000, DEFAULT_DEPOSIT_ONLY_CONFIG)).toBe(400);
  });
});

describe('getDepositOnlyConfig', () => {
  it('returns the config stored via getPaymentsConfig', async () => {
    mockGetPaymentsConfig.mockResolvedValueOnce({
      depositOnly: { feeFloorCents: 175, feePercent: 0.18, depositMin: 7, depositIncrement: 1, depositMaxPctOfFare: 0.4, noShowDriverPct: 1.0, extrasFeePercent: 0.20 },
    });
    const config = await getDepositOnlyConfig();
    expect(config.feeFloorCents).toBe(175);
    expect(config.feePercent).toBeCloseTo(0.18, 2);
    expect(config.depositMin).toBe(7);
  });

  it('falls back to defaults when getPaymentsConfig throws', async () => {
    mockGetPaymentsConfig.mockRejectedValueOnce(new Error('connection refused'));
    const config = await getDepositOnlyConfig();
    expect(config).toEqual(DEFAULT_DEPOSIT_ONLY_CONFIG);
  });

  it('merges returned depositOnly over DEFAULT_DEPOSIT_ONLY_CONFIG', async () => {
    mockGetPaymentsConfig.mockResolvedValueOnce({
      depositOnly: { feeFloorCents: 200 },
    });
    const config = await getDepositOnlyConfig();
    expect(config.feeFloorCents).toBe(200);
    // Other defaults preserved
    expect(config.feePercent).toBe(DEFAULT_DEPOSIT_ONLY_CONFIG.feePercent);
  });
});

describe('DepositOnlyStrategy.calculateHold', () => {
  const strategy = new DepositOnlyStrategy();

  it('authorizes only the selected deposit, NOT the full ride amount', async () => {
    const decision = await strategy.calculateHold({
      driverId: 'd1', riderId: 'r1', driverTier: 'free',
      agreedPrice: 20, addOnReserve: 0,
      selectedDeposit: 8,
    });
    expect(decision.authorizeAmountCents).toBe(800);
    expect(decision.visibleDeposit).toBe(8);
    expect(decision.ridePrice).toBe(20);
    expect(decision.holdMode).toBe('deposit_only');
  });

  it('honors a driver deposit floor below the platform minimum (lower of the two)', async () => {
    // selectedDeposit IS the driver's deposit_floor. A driver willing to take a
    // $1 deposit is NOT forced up to the $5 platform default.
    const decision = await strategy.calculateHold({
      driverId: 'd1', riderId: 'r1', driverTier: 'free',
      agreedPrice: 20, addOnReserve: 0,
      selectedDeposit: 1,
    });
    expect(decision.visibleDeposit).toBe(1);
    expect(decision.authorizeAmountCents).toBe(100);
  });

  it('clamps an over-cap selection down to 50% of fare', async () => {
    const decision = await strategy.calculateHold({
      driverId: 'd1', riderId: 'r1', driverTier: 'free',
      agreedPrice: 20, addOnReserve: 0,
      selectedDeposit: 50,
    });
    expect(decision.visibleDeposit).toBe(10);
    expect(decision.authorizeAmountCents).toBe(1000);
  });

  it('defaults to the configured minimum when no selection is passed', async () => {
    const decision = await strategy.calculateHold({
      driverId: 'd1', riderId: 'r1', driverTier: 'free',
      agreedPrice: 20, addOnReserve: 0,
    });
    expect(decision.visibleDeposit).toBe(5);
  });
});

describe('DepositOnlyStrategy.calculateCapture', () => {
  const strategy = new DepositOnlyStrategy();

  it('captures the full deposit and applies max($1.50, 20%) fee — floor wins for $5', async () => {
    // The caller passes the visibleDeposit as agreedPrice (the deposit IS what
    // we authorized; it's all that exists in deposit-only mode).
    const decision = await strategy.calculateCapture({
      driverId: 'd1', rideId: 'r1',
      agreedPrice: 20, addOnTotal: 0, visibleDeposit: 5,
      driverTier: 'free', driverPayoutMethod: 'bank',
      cumulativeDailyEarnings: 0, dailyFeePaid: 0, weeklyFeePaid: 0,
      inFreeWindow: false,
    });
    expect(decision.captureAmountCents).toBe(500);
    expect(decision.applicationFeeCents).toBe(150);   // floor wins (20% would be $1)
    expect(decision.driverReceives).toBe(3.5);
    expect(decision.platformReceives).toBe(1.5);
  });

  it('charges 20% of deposit when above the floor breakeven ($10 deposit)', async () => {
    const decision = await strategy.calculateCapture({
      driverId: 'd1', rideId: 'r1',
      agreedPrice: 30, addOnTotal: 0, visibleDeposit: 10,
      driverTier: 'free', driverPayoutMethod: 'bank',
      cumulativeDailyEarnings: 0, dailyFeePaid: 0, weeklyFeePaid: 0,
      inFreeWindow: false,
    });
    expect(decision.captureAmountCents).toBe(1000);
    expect(decision.applicationFeeCents).toBe(200);   // 20% of $10
    expect(decision.driverReceives).toBe(8);
    expect(decision.platformReceives).toBe(2);
  });

  it('loads Stripe onto the driver when stripeFeeBearer = driver ($10 deposit)', async () => {
    mockGetPaymentsConfig.mockResolvedValue({
      depositOnly: { ...DEFAULT_DEPOSIT_ONLY_CONFIG, stripeFeeBearer: 'driver' },
    });
    const decision = await strategy.calculateCapture({
      driverId: 'd1', rideId: 'r1',
      agreedPrice: 30, addOnTotal: 0, visibleDeposit: 10,
      driverTier: 'free', driverPayoutMethod: 'bank',
      cumulativeDailyEarnings: 0, dailyFeePaid: 0, weeklyFeePaid: 0,
      inFreeWindow: false,
    });
    // application_fee = HMU fee ($2.00) + Stripe (2.9%×$10 + $0.30 = $0.59) = $2.59
    expect(decision.applicationFeeCents).toBe(259);
    expect(decision.driverReceives).toBe(7.41);   // deposit − fee − Stripe
    expect(decision.stripeFee).toBe(0.59);
    expect(decision.platformReceives).toBe(2.59);
  });

  it('waives the platform fee when driver is in the free window', async () => {
    const decision = await strategy.calculateCapture({
      driverId: 'd1', rideId: 'r1',
      agreedPrice: 30, addOnTotal: 0, visibleDeposit: 10,
      driverTier: 'free', driverPayoutMethod: 'bank',
      cumulativeDailyEarnings: 0, dailyFeePaid: 0, weeklyFeePaid: 0,
      inFreeWindow: true,
    });
    expect(decision.applicationFeeCents).toBe(0);
    expect(decision.driverReceives).toBe(10);
    expect(decision.waivedFee).toBe(2);
  });

  it('does NOT track daily/weekly caps in deposit-only mode', async () => {
    const decision = await strategy.calculateCapture({
      driverId: 'd1', rideId: 'r1',
      agreedPrice: 50, addOnTotal: 0, visibleDeposit: 20,
      driverTier: 'free', driverPayoutMethod: 'bank',
      cumulativeDailyEarnings: 9999, dailyFeePaid: 9999, weeklyFeePaid: 9999,
      inFreeWindow: false,
    });
    expect(decision.dailyCapHit).toBe(false);
    expect(decision.weeklyCapHit).toBe(false);
  });
});

describe('DepositOnlyStrategy.calculateNoShow', () => {
  const strategy = new DepositOnlyStrategy();

  it('keeps 100% of deposit minus fee on no-show ($5 deposit → driver $3.50, platform $1.50)', async () => {
    const decision = await strategy.calculateNoShow({
      driverId: 'd1', rideId: 'r1',
      baseFare: 20, visibleDeposit: 5, addOnReserve: 0, noShowPercent: 100,
    });
    expect(decision.captureAmountCents).toBe(500);
    expect(decision.applicationFeeCents).toBe(150);
    expect(decision.driverAmount).toBe(3.5);
    expect(decision.platformAmount).toBe(1.5);
    expect(decision.riderRefunded).toBe(0);
  });

  it('keeps 100% of $20 deposit minus 20% fee on no-show', async () => {
    const decision = await strategy.calculateNoShow({
      driverId: 'd1', rideId: 'r1',
      baseFare: 50, visibleDeposit: 20, addOnReserve: 0, noShowPercent: 100,
    });
    expect(decision.captureAmountCents).toBe(2000);
    expect(decision.applicationFeeCents).toBe(400);
    expect(decision.driverAmount).toBe(16);
    expect(decision.platformAmount).toBe(4);
  });
});

describe('DepositOnlyStrategy.calculateCancel', () => {
  const strategy = new DepositOnlyStrategy();

  it('voids the auth on before-OTW cancel (zero capture, full visible-deposit refund)', async () => {
    const decision = await strategy.calculateCancel({
      driverId: 'd1', rideId: 'r1',
      visibleDeposit: 5, phase: 'before_otw', driverTier: 'free',
    });
    expect(decision.captureAmountCents).toBe(0);
    expect(decision.applicationFeeCents).toBe(0);
    expect(decision.driverAmount).toBe(0);
    expect(decision.riderRefunded).toBe(5);
  });

  it('gives the driver 100% of deposit on after-OTW cancel (no platform fee on cancel)', async () => {
    const decision = await strategy.calculateCancel({
      driverId: 'd1', rideId: 'r1',
      visibleDeposit: 8, phase: 'after_otw', driverTier: 'free',
    });
    expect(decision.captureAmountCents).toBe(800);
    expect(decision.applicationFeeCents).toBe(0);
    expect(decision.driverAmount).toBe(8);
    expect(decision.platformAmount).toBe(0);
    expect(decision.riderRefunded).toBe(0);
  });
});

describe('depositOnlyStrategy is registered with the global instance', () => {
  it('exposes the modeKey "deposit_only"', () => {
    expect(depositOnlyStrategy.modeKey).toBe('deposit_only');
  });
});
