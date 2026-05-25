import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.hoisted runs before vi.mock — the bare `const sql = vi.fn()` form would
// fail because vi.mock is hoisted above ordinary `const`s.
const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql, pool: null, transaction: vi.fn() }));

// Mock the Stripe client — STRIPE_MOCK=true (set by vitest.setup.ts) gates
// these calls out of the code path, but the import still needs to resolve.
vi.mock('@/lib/stripe/connect', () => ({
  stripe: {
    paymentIntents: { create: vi.fn(), capture: vi.fn(), cancel: vi.fn() },
    paymentMethods: { create: vi.fn() },
    customers: { create: vi.fn() },
    refunds: { create: vi.fn() },
  },
}));

vi.mock('@/lib/db/enrollment-offers', () => ({
  getDriverEnrollment: vi.fn().mockResolvedValue(null),
  updateEnrollmentProgress: vi.fn().mockResolvedValue({ enrollment: null, justExhausted: false }),
  isDriverInFreeWindow: vi.fn().mockResolvedValue(false),
  getOfferProgress: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/db/service-menu', () => ({
  calculateAddOnTotal: vi.fn().mockResolvedValue(0),
}));

import { holdRiderPayment, cancelPaymentHold, partialCaptureNoShow } from '../escrow';
import { legacyFullFareStrategy, _clearStrategyCaches } from '../strategies';

beforeEach(() => {
  sql.mockReset();
  sql.mockResolvedValue([]);
  // Clear cross-test caches so each test starts with a clean slate.
  _clearStrategyCaches();
});

// Helper: find a sql template-tag call whose strings include a substring
// (the first arg to the tagged template is the strings array).
function findSqlCallContaining(needle: string): unknown[] | undefined {
  return sql.mock.calls.find((call) => {
    const strings = call[0] as readonly string[] | undefined;
    return Array.isArray(strings) && strings.some((s) => s.includes(needle));
  });
}

describe('holdRiderPayment — mock mode', () => {
  it('returns a mock payment intent id with requires_capture status', async () => {
    const result = await holdRiderPayment({
      rideId: 'ride_1',
      agreedPrice: 20,
      addOnReserve: 5,
      stripeCustomerId: 'cus_test',
      paymentMethodId: 'pm_test',
      driverStripeAccountId: 'acct_test',
      riderId: 'rider_1',
      driverId: 'driver_1',
    }, { strategy: legacyFullFareStrategy });
    expect(result.paymentIntentId).toMatch(/^pi_mock_/);
    expect(result.status).toBe('requires_capture');
  });

  it('writes one rides UPDATE and two ledger entries (rider hold + driver pending)', async () => {
    await holdRiderPayment({
      rideId: 'ride_2',
      agreedPrice: 20,
      stripeCustomerId: 'cus_test',
      paymentMethodId: 'pm_test',
      driverStripeAccountId: 'acct_test',
      riderId: 'rider_1',
      driverId: 'driver_1',
    }, { strategy: legacyFullFareStrategy });
    // 1 hold-policy SELECT + 1 UPDATE on rides + 2 INSERTs on transaction_ledger
    expect(sql).toHaveBeenCalledTimes(4);
  });

  it('defaults addOnReserve to 0 and authorizes the agreed price only', async () => {
    await holdRiderPayment({
      rideId: 'ride_3',
      agreedPrice: 15,
      stripeCustomerId: 'cus_test',
      paymentMethodId: 'pm_test',
      driverStripeAccountId: 'acct_test',
      riderId: 'rider_1',
      driverId: 'driver_1',
    }, { strategy: legacyFullFareStrategy });
    // Find the UPDATE rides call (other sql calls in the path are policy/ledger).
    const updateCall = findSqlCallContaining('UPDATE rides');
    expect(updateCall).toBeDefined();
    expect(updateCall!.slice(1)).toContain(15); // final_agreed_price
    expect(updateCall!.slice(1)).toContain(0);  // add_on_reserve
  });
});

describe('cancelPaymentHold — mock mode', () => {
  it('skips Stripe in mock mode and still writes release ledger', async () => {
    sql.mockResolvedValueOnce([{
      payment_intent_id: 'pi_mock_test',
      final_agreed_price: 20,
      rider_id: 'rider_1',
      driver_id: 'driver_1',
    }]);

    await cancelPaymentHold('ride_1', 'rider_cancelled');

    // 1 SELECT ride + 1 UPDATE + 1 INSERT ledger
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it('exits silently when ride is not found', async () => {
    sql.mockResolvedValueOnce([]); // no ride
    await expect(cancelPaymentHold('missing_ride', 'reason')).resolves.toBeUndefined();
    // Only the lookup ran, nothing else.
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('does NOT flip rides.status — money primitive only', async () => {
    // Regression for the stuck-banner bug: cancelPaymentHold used to set
    // status='cancelled' itself, which raced cascadeRideCancel — cascade
    // hit its idempotency guard and skipped the Ably status_change publish,
    // so cancel-request banners on both sides got stuck open until refresh.
    sql.mockResolvedValueOnce([{
      payment_intent_id: 'pi_mock_test',
      final_agreed_price: 20,
      rider_id: 'rider_1',
      driver_id: 'driver_1',
    }]);

    await cancelPaymentHold('ride_1', 'reason');

    const updateCall = sql.mock.calls.find((call) => {
      const strings = call[0] as readonly string[] | undefined;
      return Array.isArray(strings) && strings.some((s) => s.includes('UPDATE rides'));
    });
    expect(updateCall).toBeDefined();
    const concatenated = (updateCall![0] as readonly string[]).join(' ');
    expect(concatenated).toContain('funds_held = false');
    expect(concatenated).not.toContain("status = 'cancelled'");
  });
});

describe('partialCaptureNoShow — cash ride', () => {
  it('charges nothing on a cash ride no-show', async () => {
    sql.mockResolvedValueOnce([{
      payment_intent_id: null,
      final_agreed_price: 20,
      visible_deposit: 0,
      add_on_reserve: 0,
      driver_id: 'driver_1',
      rider_id: 'rider_1',
      is_cash: true,
    }]);

    const result = await partialCaptureNoShow('ride_1', 25, { strategy: legacyFullFareStrategy });
    expect(result.captured).toBe(0);
    expect(result.driverReceives).toBe(0);
    expect(result.platformReceives).toBe(0);
    expect(result.riderRefunded).toBe(0);
  });
});

describe('partialCaptureNoShow — 25% scenario', () => {
  it('splits a $20 base + $5 add-on correctly: driver $5, platform $1, refund $19', async () => {
    sql.mockResolvedValueOnce([{
      payment_intent_id: 'pi_mock',
      final_agreed_price: 20,
      visible_deposit: 0,
      add_on_reserve: 5,
      driver_id: 'driver_1',
      rider_id: 'rider_1',
      is_cash: false,
    }]);
    sql.mockResolvedValueOnce([{ stripe_account_id: 'acct_test' }]);

    const result = await partialCaptureNoShow('ride_1', 25, { strategy: legacyFullFareStrategy });

    expect(result.driverReceives).toBe(5);     // 20 * 0.25
    expect(result.platformReceives).toBe(1);   // 20 * 0.05
    expect(result.captured).toBe(6);           // 5 + 1
    expect(result.addOnRefunded).toBe(5);      // 100% of add-on reserve
    expect(result.riderRefunded).toBe(19);     // 14 base unrefunded + 5 add-on
  });
});

describe('partialCaptureNoShow — 50% scenario', () => {
  it('splits a $20 base correctly: driver $10, platform $2, refund $8', async () => {
    sql.mockResolvedValueOnce([{
      payment_intent_id: 'pi_mock',
      final_agreed_price: 20,
      visible_deposit: 0,
      add_on_reserve: 0,
      driver_id: 'driver_1',
      rider_id: 'rider_1',
      is_cash: false,
    }]);
    sql.mockResolvedValueOnce([{ stripe_account_id: 'acct_test' }]);

    const result = await partialCaptureNoShow('ride_1', 50, { strategy: legacyFullFareStrategy });

    expect(result.driverReceives).toBe(10);    // 20 * 0.50
    expect(result.platformReceives).toBe(2);   // 20 * 0.10
    expect(result.captured).toBe(12);
    expect(result.riderRefunded).toBe(8);
    expect(result.addOnRefunded).toBe(0);
  });
});
