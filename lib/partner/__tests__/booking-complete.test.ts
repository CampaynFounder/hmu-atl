import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ sql, pool: null, transaction: vi.fn() }));
vi.mock('@/lib/stripe/connect', () => ({
  stripe: { paymentIntents: { capture: vi.fn(() => Promise.resolve({})), cancel: vi.fn(() => Promise.resolve({})) } },
}));
vi.mock('@/lib/ably/server', () => ({ publishAdminEvent: vi.fn(() => Promise.resolve()) }));
vi.mock('@/lib/partner/webhooks', () => ({ dispatchPartnerEvent: vi.fn(() => Promise.resolve()) }));

import { completePartnerBooking } from '@/lib/partner/booking-complete';

beforeEach(() => sql.mockReset());

const text = (strings: TemplateStringsArray | undefined) =>
  strings ? Array.from(strings).join(' ') : '';

describe('completePartnerBooking', () => {
  it('404s when not found for this partner', async () => {
    sql.mockResolvedValue([]);
    const r = await completePartnerBooking('p1', 'post-x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(404);
  });

  it('is idempotent when already completed', async () => {
    sql.mockResolvedValueOnce([{ id: 'pb-1', status: 'completed', ride_id: 'ride-1', driver_payout_cents: 680, platform_fee_cents: 120 }]);
    sql.mockResolvedValue([]);
    const r = await completePartnerBooking('p1', 'post-1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.alreadyComplete).toBe(true);
  });

  it('409s when the driver has not accepted yet', async () => {
    sql.mockResolvedValueOnce([{ id: 'pb-1', status: 'pending_accept', ride_id: null, driver_payout_cents: 680, platform_fee_cents: 120 }]);
    sql.mockResolvedValue([]);
    const r = await completePartnerBooking('p1', 'post-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(409);
  });

  it('captures and completes an accepted booking', async () => {
    let captured = false;
    sql.mockImplementation((strings: TemplateStringsArray) => {
      const s = text(strings);
      if (s.includes('FROM partner_bookings') && s.includes('post_id ='))
        return Promise.resolve([{ id: 'pb-1', status: 'accepted', ride_id: 'ride-1', driver_payout_cents: 680, platform_fee_cents: 120 }]);
      if (s.includes('FROM partner_bookings') && s.includes('ride_id =')) // capture lookup
        return Promise.resolve([{ id: 'pb-1', partner_id: 'p1', post_id: 'post-1', payment_intent_id: 'pi_partner_mock_x', delivery_fee_cents: 800, platform_fee_cents: 120, driver_payout_cents: 680, rider_id: 'r1', driver_id: 'd1' }]);
      if (s.includes("UPDATE partner_bookings SET status = 'captured'")) { captured = true; return Promise.resolve([]); }
      if (s.includes('SELECT status FROM partner_bookings')) return Promise.resolve([{ status: captured ? 'captured' : 'accepted' }]);
      return Promise.resolve([]);
    });
    const r = await completePartnerBooking('p1', 'post-1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe('completed');
      expect(r.alreadyComplete).toBe(false);
      expect(r.driverPayoutCents).toBe(680);
    }
  });

  it('502s when the capture fails (booking left for retry)', async () => {
    sql.mockImplementation((strings: TemplateStringsArray) => {
      const s = text(strings);
      if (s.includes('FROM partner_bookings') && s.includes('post_id ='))
        return Promise.resolve([{ id: 'pb-1', status: 'accepted', ride_id: 'ride-1', driver_payout_cents: 680, platform_fee_cents: 120 }]);
      // capture lookup returns nothing → maybeCapturePartnerHold no-ops, status stays 'accepted'
      if (s.includes('SELECT status FROM partner_bookings')) return Promise.resolve([{ status: 'accepted' }]);
      return Promise.resolve([]);
    });
    const r = await completePartnerBooking('p1', 'post-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.httpStatus).toBe(502);
  });
});
