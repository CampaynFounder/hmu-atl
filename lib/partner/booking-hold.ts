// Partner delivery hold — placed when the driver accepts.
//
// Called from the booking-accept route AFTER the ride is created. For any
// normal (non-partner) booking this no-ops immediately (no partner_bookings
// row), so it is inert unless a partner booking created one.
//
// For vendor_funded partners it authorizes the delivery fee on the vendor's
// Stripe customer as a MANUAL-CAPTURE PaymentIntent routed to the driver's
// connected account. We do NOT reuse holdRiderPayment/captureRiderPayment —
// those apply the ride's tiered platform fee, which is not the delivery split.
// The application_fee_amount (= platform_fee_cents) is applied at capture
// (PR2c), per Stripe's manual-capture model.

import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { publishAdminEvent } from '@/lib/ably/server';
import { dispatchPartnerEvent } from '@/lib/partner/webhooks';
import { customerDefaultPaymentMethod } from '@/lib/partner/payer';

function isMock(): boolean {
  return process.env.STRIPE_MOCK === 'true';
}

interface PartnerBookingRow {
  id: string;
  partner_id: string;
  delivery_fee_cents: number;
  driver_id: string;
  payer_mode: 'vendor_funded' | 'pass_through';
  vendor_stripe_customer_id: string | null;
  rider_customer_id: string | null;
}

/**
 * If `postId` belongs to a pending partner booking, authorize the delivery fee
 * and link the PaymentIntent to the freshly-created ride. Never throws — on
 * failure it marks the booking `hold_failed` and returns. Safe to call for
 * every accepted booking.
 */
export async function maybePlacePartnerHold(
  postId: string,
  rideId: string,
  driverUserId: string,
): Promise<void> {
  const rows = await sql`
    SELECT pb.id, pb.partner_id, pb.delivery_fee_cents, pb.driver_id,
           p.payer_mode, p.vendor_stripe_customer_id,
           pr.stripe_customer_id AS rider_customer_id
    FROM partner_bookings pb
    JOIN api_partners p ON p.id = pb.partner_id
    LEFT JOIN partner_riders pr ON pr.user_id = pb.rider_id AND pr.partner_id = pb.partner_id
    WHERE pb.post_id = ${postId} AND pb.status = 'pending_accept'
    LIMIT 1
  `;
  const pb = rows[0] as PartnerBookingRow | undefined;
  if (!pb) return; // not a partner booking — no-op

  try {
    const driverRows = await sql`
      SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
    `;
    const driverStripeAccountId = (driverRows[0] as { stripe_account_id: string | null } | undefined)
      ?.stripe_account_id;
    if (!driverStripeAccountId) throw new Error('driver has no Stripe connected account');

    // Funding customer depends on payer mode: the rider's own guest customer
    // (pass_through) or the partner's shared vendor customer (vendor_funded).
    const fundingCustomer =
      pb.payer_mode === 'pass_through' ? pb.rider_customer_id : pb.vendor_stripe_customer_id;
    if (!fundingCustomer) throw new Error('no funding Stripe customer for this booking');

    let paymentIntentId: string;

    if (isMock()) {
      paymentIntentId = `pi_partner_mock_${postId}`;
    } else {
      const pmId = await customerDefaultPaymentMethod(fundingCustomer);
      if (!pmId) throw new Error('funding customer has no payment method on file');

      const pi = await stripe.paymentIntents.create(
        {
          amount: pb.delivery_fee_cents,
          currency: 'usd',
          customer: fundingCustomer,
          payment_method: pmId,
          capture_method: 'manual',
          confirm: true,
          off_session: true,
          transfer_data: { destination: driverStripeAccountId },
          statement_descriptor_suffix: 'HMU DELIV',
          metadata: { partnerBookingId: pb.id, postId, rideId, kind: 'partner_delivery' },
        },
        { idempotencyKey: `partner_hold_${postId}_${pb.delivery_fee_cents}` },
      );

      if (pi.status !== 'requires_capture') {
        // Hold didn't stick — best-effort cancel so we don't leave a dangling auth.
        await stripe.paymentIntents.cancel(pi.id).catch(() => {});
        throw new Error(`PaymentIntent status ${pi.status} (expected requires_capture)`);
      }
      paymentIntentId = pi.id;
    }

    await sql`
      UPDATE rides
      SET payment_intent_id = ${paymentIntentId},
          funds_held = true,
          payment_authorized = true,
          payment_authorized_at = NOW()
      WHERE id = ${rideId}
    `;
    await sql`
      UPDATE partner_bookings
      SET ride_id = ${rideId}, payment_intent_id = ${paymentIntentId},
          status = 'accepted', updated_at = NOW()
      WHERE id = ${pb.id}
    `;
    dispatchPartnerEvent(pb.partner_id, 'booking.accepted', {
      booking_id: postId,
      ride_id: rideId,
    }).catch(() => {});
  } catch (e) {
    console.error('[partner/hold] failed to place hold:', e);
    await sql`
      UPDATE partner_bookings SET ride_id = ${rideId}, status = 'hold_failed', updated_at = NOW()
      WHERE id = ${pb.id}
    `.catch(() => {});
    publishAdminEvent('partner_hold_failed', {
      partnerBookingId: pb.id,
      postId,
      rideId,
      reason: e instanceof Error ? e.message : String(e),
    }).catch(() => {});
    dispatchPartnerEvent(pb.partner_id, 'booking.hold_failed', {
      booking_id: postId,
      ride_id: rideId,
    }).catch(() => {});
  }
}
