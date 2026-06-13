// Partner delivery — complete (vendor-driven capture).
//
// A partner delivery has a synthetic rider, so the normal rider "I'm in" tap
// that triggers capture never happens. Instead the vendor calls this when the
// delivery is done: it captures the held delivery fee (paying the driver) and
// marks the booking + ride completed.

import { sql } from '@/lib/db/client';
import { maybeCapturePartnerHold } from '@/lib/partner/booking-capture';

export type CompleteResult =
  | { ok: true; status: 'completed'; alreadyComplete: boolean; driverPayoutCents: number; platformFeeCents: number }
  | { ok: false; httpStatus: number; error: string; message: string };

export async function completePartnerBooking(partnerId: string, postId: string): Promise<CompleteResult> {
  const rows = await sql`
    SELECT id, status, ride_id, driver_payout_cents, platform_fee_cents
    FROM partner_bookings
    WHERE post_id = ${postId} AND partner_id = ${partnerId}
    LIMIT 1
  `;
  const pb = rows[0] as
    | { id: string; status: string; ride_id: string | null; driver_payout_cents: number; platform_fee_cents: number }
    | undefined;

  if (!pb) return { ok: false, httpStatus: 404, error: 'not_found', message: 'Booking not found' };

  // Idempotent: already paid out.
  if (pb.status === 'captured' || pb.status === 'completed') {
    if (pb.status === 'captured') {
      await sql`UPDATE partner_bookings SET status = 'completed', updated_at = NOW() WHERE id = ${pb.id}`;
    }
    return {
      ok: true,
      status: 'completed',
      alreadyComplete: true,
      driverPayoutCents: pb.driver_payout_cents,
      platformFeeCents: pb.platform_fee_cents,
    };
  }

  if (pb.status !== 'accepted') {
    return {
      ok: false,
      httpStatus: 409,
      error: 'not_completable',
      message: `Booking is '${pb.status}'; only an accepted booking (driver accepted, hold placed) can be completed`,
    };
  }
  if (!pb.ride_id) {
    return { ok: false, httpStatus: 409, error: 'no_ride', message: 'Booking has no ride to complete' };
  }

  // Capture the held delivery fee. maybeCapturePartnerHold flips the booking to
  // 'captured' only on a successful capture, so we re-read to confirm rather
  // than trust its return (it returns handled:true even on Stripe failure to
  // block the wrong ride-tier capture).
  await maybeCapturePartnerHold(pb.ride_id);

  const after = await sql`SELECT status FROM partner_bookings WHERE id = ${pb.id} LIMIT 1`;
  const afterStatus = (after[0] as { status: string } | undefined)?.status;
  if (afterStatus !== 'captured') {
    return {
      ok: false,
      httpStatus: 502,
      error: 'capture_failed',
      message: 'Payment capture failed; booking left accepted for retry',
    };
  }

  // Mark the booking complete and advance the ride to its terminal state.
  // Direct UPDATE (system action) — partner deliveries don't traverse the
  // rider/driver tap chain the state machine models.
  await sql`UPDATE partner_bookings SET status = 'completed', updated_at = NOW() WHERE id = ${pb.id}`;
  await sql`
    UPDATE rides SET status = 'completed', updated_at = NOW()
    WHERE id = ${pb.ride_id} AND status NOT IN ('cancelled', 'refunded', 'disputed')
  `;

  return {
    ok: true,
    status: 'completed',
    alreadyComplete: false,
    driverPayoutCents: pb.driver_payout_cents,
    platformFeeCents: pb.platform_fee_cents,
  };
}
