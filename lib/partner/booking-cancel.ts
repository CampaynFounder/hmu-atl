// Partner delivery — cancel (before capture).
//
// Releases any held delivery-fee PI and cancels the underlying post / matched
// ride / calendar hold. Cannot cancel once captured or completed.

import { sql } from '@/lib/db/client';
import { publishAdminEvent } from '@/lib/ably/server';
import { releasePartnerHold } from '@/lib/partner/booking-capture';

export type CancelResult =
  | { ok: true; status: 'cancelled' }
  | { ok: false; httpStatus: number; error: string; message: string };

export async function cancelPartnerBooking(partnerId: string, postId: string): Promise<CancelResult> {
  const rows = await sql`
    SELECT id, status, payment_intent_id, ride_id, post_id
    FROM partner_bookings
    WHERE post_id = ${postId} AND partner_id = ${partnerId}
    LIMIT 1
  `;
  const pb = rows[0] as
    | { id: string; status: string; payment_intent_id: string | null; ride_id: string | null; post_id: string }
    | undefined;

  if (!pb) return { ok: false, httpStatus: 404, error: 'not_found', message: 'Booking not found' };
  if (pb.status === 'cancelled') return { ok: true, status: 'cancelled' }; // idempotent
  if (pb.status === 'captured' || pb.status === 'completed') {
    return { ok: false, httpStatus: 409, error: 'not_cancelable', message: 'Booking already captured' };
  }

  // Release the authorization hold if one was placed (status 'accepted').
  if (pb.payment_intent_id) {
    await releasePartnerHold(pb.payment_intent_id);
  }

  // Cancel the post, the matched ride (if any, pre-active), and the calendar hold.
  await sql`UPDATE hmu_posts SET status = 'cancelled' WHERE id = ${pb.post_id} AND status IN ('active', 'matched')`;
  if (pb.ride_id) {
    await sql`UPDATE rides SET status = 'cancelled', updated_at = NOW()
              WHERE id = ${pb.ride_id} AND status IN ('matched', 'confirming')`;
  }
  await sql`UPDATE driver_bookings SET status = 'cancelled'
            WHERE (details->>'postId') = ${pb.post_id} AND status IN ('tentative', 'confirmed', 'scheduled')`
    .catch(() => {});

  await sql`UPDATE partner_bookings SET status = 'cancelled', updated_at = NOW() WHERE id = ${pb.id}`;

  publishAdminEvent('partner_booking_cancelled', { partnerBookingId: pb.id, postId }).catch(() => {});
  return { ok: true, status: 'cancelled' };
}
