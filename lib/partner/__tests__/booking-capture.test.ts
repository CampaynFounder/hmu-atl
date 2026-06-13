import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the DB client + side-effect deps (same pattern as escrow.test.ts).
const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql, pool: null, transaction: vi.fn() }));
vi.mock('@/lib/stripe/connect', () => ({
  stripe: {
    paymentIntents: {
      capture: vi.fn(() => Promise.resolve({})),
      cancel: vi.fn(() => Promise.resolve({})),
    },
  },
}));
vi.mock('@/lib/ably/server', () => ({ publishAdminEvent: vi.fn(() => Promise.resolve()) }));

import { maybeCapturePartnerHold } from '@/lib/partner/booking-capture';
import { cancelPartnerBooking } from '@/lib/partner/booking-cancel';

beforeEach(() => {
  sql.mockReset();
  sql.mockResolvedValue([]);
});

// Find a sql template-tag call whose query text includes a substring.
function findCall(substr: string) {
  return sql.mock.calls.find((call) => {
    const strings = call[0] as unknown as TemplateStringsArray | undefined;
    return strings && Array.from(strings).join(' ').includes(substr);
  });
}

describe('maybeCapturePartnerHold', () => {
  it('no-ops for a normal ride (no partner booking)', async () => {
    sql.mockResolvedValueOnce([]); // partner_bookings lookup → none
    const out = await maybeCapturePartnerHold('ride-1');
    expect(out.handled).toBe(false);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('captures with the delivery split and marks the booking captured', async () => {
    sql.mockResolvedValueOnce([
      {
        id: 'pb-1',
        payment_intent_id: 'pi_partner_mock_post-1', // mock → no real Stripe call
        delivery_fee_cents: 800,
        platform_fee_cents: 120,
        driver_payout_cents: 680,
        rider_id: 'rider-1',
        driver_id: 'driver-1',
      },
    ]);

    const out = await maybeCapturePartnerHold('ride-1');

    expect(out.handled).toBe(true);
    expect(out.driverReceives).toBe(6.8); // 680¢
    expect(out.platformFee).toBe(1.2); // 120¢

    // rides marked captured with the split amounts
    const rideUpdate = findCall('payment_captured = true');
    expect(rideUpdate).toBeTruthy();
    // partner_bookings advanced to captured
    expect(findCall("status = 'captured'")).toBeTruthy();
    // ledger written
    expect(findCall('INSERT INTO transaction_ledger')).toBeTruthy();
  });
});

describe('cancelPartnerBooking', () => {
  it('404s when the booking is not found for this partner', async () => {
    sql.mockResolvedValueOnce([]);
    const r = await cancelPartnerBooking('partner-1', 'post-x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(404);
  });

  it('is idempotent when already cancelled', async () => {
    sql.mockResolvedValueOnce([{ id: 'pb-1', status: 'cancelled', payment_intent_id: null, ride_id: null, post_id: 'post-1' }]);
    const r = await cancelPartnerBooking('partner-1', 'post-1');
    expect(r.ok).toBe(true);
  });

  it('refuses to cancel once captured', async () => {
    sql.mockResolvedValueOnce([{ id: 'pb-1', status: 'captured', payment_intent_id: 'pi_x', ride_id: 'ride-1', post_id: 'post-1' }]);
    const r = await cancelPartnerBooking('partner-1', 'post-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(409);
  });

  it('cancels a pending booking (post + ledger row)', async () => {
    sql.mockResolvedValueOnce([{ id: 'pb-1', status: 'pending_accept', payment_intent_id: null, ride_id: null, post_id: 'post-1' }]);
    const r = await cancelPartnerBooking('partner-1', 'post-1');
    expect(r.ok).toBe(true);
    expect(findCall("UPDATE hmu_posts SET status = 'cancelled'")).toBeTruthy();
    expect(findCall("UPDATE partner_bookings SET status = 'cancelled'")).toBeTruthy();
  });
});
