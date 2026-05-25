import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql, pool: null, transaction: vi.fn() }));

import {
  resolvePricingStrategy,
  resolveGlobalDefault,
  registerStrategy,
  getStrategy,
  legacyFullFareStrategy,
  _clearStrategyCaches,
} from '../strategies';
import { LegacyFullFareStrategy } from '../strategies/legacy-full-fare';
import type { PricingStrategy } from '../strategies/types';
import { calculateDriverPayout } from '../fee-calculator';

beforeEach(() => {
  sql.mockReset();
  _clearStrategyCaches();
});

describe('strategy registry', () => {
  it('has legacy_full_fare registered by default', () => {
    expect(getStrategy('legacy_full_fare')).toBeDefined();
    expect(getStrategy('legacy_full_fare')?.modeKey).toBe('legacy_full_fare');
  });

  it('returns undefined for an unknown mode', () => {
    expect(getStrategy('nonexistent_mode')).toBeUndefined();
  });

  it('lets a new strategy register and be retrieved', () => {
    const stub: PricingStrategy = {
      modeKey: 'test_stub',
      displayName: 'Stub',
      allowsCashOnly: true,
      calculateHold: vi.fn(),
      calculateCapture: vi.fn(),
      calculateNoShow: vi.fn(),
      calculateCancel: vi.fn(),
      buildBreakdownRows: vi.fn(),
    };
    registerStrategy(stub);
    expect(getStrategy('test_stub')).toBe(stub);
  });
});

describe('resolvePricingStrategy', () => {
  it('returns the assigned mode when driver has an active cohort assignment', async () => {
    sql.mockResolvedValueOnce([{ mode_key: 'legacy_full_fare' }]);
    const strategy = await resolvePricingStrategy('driver_with_assignment');
    expect(strategy.modeKey).toBe('legacy_full_fare');
  });

  it('falls back to the global-default mode when driver has no assignment', async () => {
    // First call: driver lookup → no rows
    sql.mockResolvedValueOnce([]);
    // Second call: global default lookup → legacy_full_fare
    sql.mockResolvedValueOnce([{ mode_key: 'legacy_full_fare' }]);

    const strategy = await resolvePricingStrategy('driver_no_assignment');
    expect(strategy.modeKey).toBe('legacy_full_fare');
  });

  it('falls back to LegacyFullFareStrategy when DB throws on driver lookup', async () => {
    sql.mockRejectedValueOnce(new Error('DB unavailable'));
    sql.mockResolvedValueOnce([{ mode_key: 'legacy_full_fare' }]);

    const strategy = await resolvePricingStrategy('driver_db_error');
    expect(strategy.modeKey).toBe('legacy_full_fare');
  });

  it('falls back to LegacyFullFareStrategy when global-default lookup also fails', async () => {
    sql.mockRejectedValueOnce(new Error('DB unavailable'));
    sql.mockRejectedValueOnce(new Error('DB still unavailable'));

    const strategy = await resolvePricingStrategy('driver_total_failure');
    expect(strategy).toBe(legacyFullFareStrategy);
  });

  it('returns LegacyFullFareStrategy without hitting DB when driverId is empty', async () => {
    const strategy = await resolvePricingStrategy('');
    expect(strategy).toBe(legacyFullFareStrategy);
    expect(sql).not.toHaveBeenCalled();
  });
});

describe('resolveGlobalDefault', () => {
  it('returns the legacy_full_fare strategy when DB returns it as default', async () => {
    sql.mockResolvedValueOnce([{ mode_key: 'legacy_full_fare' }]);
    const strategy = await resolveGlobalDefault();
    expect(strategy.modeKey).toBe('legacy_full_fare');
  });

  it('returns LegacyFullFareStrategy on DB error', async () => {
    sql.mockRejectedValueOnce(new Error('boom'));
    const strategy = await resolveGlobalDefault();
    expect(strategy).toBe(legacyFullFareStrategy);
  });

  it('returns LegacyFullFareStrategy when no row is marked default', async () => {
    sql.mockResolvedValueOnce([]);
    const strategy = await resolveGlobalDefault();
    expect(strategy).toBe(legacyFullFareStrategy);
  });
});

describe('LegacyFullFareStrategy — parity with existing capture math', () => {
  // These numbers MUST match the legacy escrow.captureRiderPayment behavior.
  // If a future change breaks parity, these tests fail before the legacy
  // strategy diverges from the un-refactored code path.
  const strategy = new LegacyFullFareStrategy();

  it('calculateCapture matches calculateDriverPayout for a $20 free-tier ride (CLAUDE.md viral example)', async () => {
    // Reference numbers from fee-calculator.test.ts:
    //   stripeFee 0.88, platformFee 1.91, driverReceives 17.21, platformReceives 2.79
    const decision = await strategy.calculateCapture({
      driverId: 'd1',
      rideId: 'r1',
      agreedPrice: 20,
      addOnTotal: 0,
      visibleDeposit: 0,
      driverTier: 'free',
      driverPayoutMethod: 'bank',
      cumulativeDailyEarnings: 0,
      dailyFeePaid: 0,
      weeklyFeePaid: 0,
      inFreeWindow: false,
    });
    const ref = calculateDriverPayout(20, 'free', 0, 0, 0);

    expect(decision.captureAmountCents).toBe(2000);
    expect(decision.applicationFeeCents).toBe(Math.round(ref.platformFee * 100));
    expect(decision.platformFee).toBe(ref.platformFee);
    expect(decision.stripeFee).toBe(ref.stripeFee);
    expect(decision.driverReceives).toBe(ref.driverReceives);
    // platformReceives via calculateFullBreakdown also includes dotsPayoutFee, which is 0 for 'bank'.
    expect(decision.platformReceives).toBe(ref.platformReceives);
  });

  it('calculateCapture waives the platform fee when driver is in free window', async () => {
    const decision = await strategy.calculateCapture({
      driverId: 'd1',
      rideId: 'r1',
      agreedPrice: 20,
      addOnTotal: 0,
      visibleDeposit: 0,
      driverTier: 'free',
      driverPayoutMethod: 'bank',
      cumulativeDailyEarnings: 0,
      dailyFeePaid: 0,
      weeklyFeePaid: 0,
      inFreeWindow: true,
    });

    expect(decision.applicationFeeCents).toBe(0);
    expect(decision.waivedFee).toBeCloseTo(1.91, 2);
    // Driver gets net-after-Stripe (no platform fee deducted)
    expect(decision.driverReceives).toBeCloseTo(19.12, 2);
  });

  it('calculateNoShow at 25% matches legacy split (driver 25%, platform 5%, rider refunded 70%)', async () => {
    const decision = await strategy.calculateNoShow({
      driverId: 'd1',
      rideId: 'r1',
      baseFare: 20,
      visibleDeposit: 0,
      addOnReserve: 5,
      noShowPercent: 25,
    });

    expect(decision.driverAmount).toBe(5); // 25% of 20
    expect(decision.platformAmount).toBe(1); // 5% of 20
    expect(decision.captureAmountCents).toBe(600); // $6
    expect(decision.applicationFeeCents).toBe(100); // $1
    expect(decision.riderRefunded).toBe(14); // 20 - 6
    expect(decision.addOnRefunded).toBe(5); // add-ons fully refunded
  });

  it('calculateNoShow at 50% matches legacy split (driver 50%, platform 10%, rider refunded 40%)', async () => {
    const decision = await strategy.calculateNoShow({
      driverId: 'd1',
      rideId: 'r1',
      baseFare: 20,
      visibleDeposit: 0,
      addOnReserve: 0,
      noShowPercent: 50,
    });

    expect(decision.driverAmount).toBe(10); // 50% of 20
    expect(decision.platformAmount).toBe(2); // 10% of 20
    expect(decision.captureAmountCents).toBe(1200);
    expect(decision.applicationFeeCents).toBe(200);
    expect(decision.riderRefunded).toBe(8);
  });

  it('calculateHold authorizes full ride amount + add-on reserve in legacy mode', async () => {
    sql.mockResolvedValue([]); // hold-policy fallback to defaults
    const decision = await strategy.calculateHold({
      driverId: 'd1',
      riderId: 'r1',
      driverTier: 'free',
      agreedPrice: 20,
      addOnReserve: 5,
    });

    // Legacy authorizes FULL ride + add-ons (not just visible deposit).
    expect(decision.authorizeAmountCents).toBe(2500);
    expect(decision.ridePrice).toBe(20);
    expect(decision.addOnReserve).toBe(5);
    // visibleDeposit comes from hold-policy defaults (free tier = 25% with $5 floor)
    // → 25% of 20 = 5, floor is also 5 → visible_deposit = 5
    expect(decision.visibleDeposit).toBe(5);
    expect(decision.holdMode).toBe('deposit_percent');
  });
});
