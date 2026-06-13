// Partner delivery — capture at Start Ride, and hold release on cancel.
//
// Capture: when the rider/flow starts the ride, the held delivery-fee PI is
// captured for exactly delivery_fee_cents with application_fee_amount =
// platform_fee_cents (the delivery split). We deliberately do NOT use
// captureRiderPayment — that applies the ride's tiered platform fee, which is
// the wrong number for a partner delivery. maybeCapturePartnerHold returns
// { handled: true } so the caller skips the normal capture path.
//
// Release: on cancel before capture, the manual-capture PI is canceled to free
// the authorization.

import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { publishAdminEvent } from '@/lib/ably/server';
import { dispatchPartnerEvent } from '@/lib/partner/webhooks';

function isMock(): boolean {
  return process.env.STRIPE_MOCK === 'true';
}

function isMockPi(piId: string | null | undefined): boolean {
  return !piId || piId.startsWith('pi_partner_mock_');
}

export interface PartnerCaptureOutcome {
  handled: boolean; // true → caller must NOT run the normal ride capture
  driverReceives?: number; // dollars
  platformFee?: number; // dollars
}

interface CaptureRow {
  id: string;
  partner_id: string;
  post_id: string;
  payment_intent_id: string | null;
  delivery_fee_cents: number;
  platform_fee_cents: number;
  driver_payout_cents: number;
  rider_id: string;
  driver_id: string;
}

/**
 * If `rideId` belongs to an accepted partner booking, capture the held delivery
 * fee with the delivery-fee split and return { handled: true } so the caller
 * skips captureRiderPayment. No-ops (handled: false) for normal rides. Never
 * throws — on Stripe failure it still returns handled: true so the wrong-fee
 * ride capture never runs, and flags the booking for follow-up.
 */
export async function maybeCapturePartnerHold(rideId: string): Promise<PartnerCaptureOutcome> {
  const rows = await sql`
    SELECT id, partner_id, post_id, payment_intent_id, delivery_fee_cents,
           platform_fee_cents, driver_payout_cents, rider_id, driver_id
    FROM partner_bookings
    WHERE ride_id = ${rideId} AND status = 'accepted'
    LIMIT 1
  `;
  const pb = rows[0] as CaptureRow | undefined;
  if (!pb) return { handled: false }; // not a partner ride — normal capture applies

  try {
    if (!isMock() && !isMockPi(pb.payment_intent_id)) {
      await stripe.paymentIntents.capture(
        pb.payment_intent_id as string,
        {
          amount_to_capture: pb.delivery_fee_cents,
          application_fee_amount: pb.platform_fee_cents,
        },
        { idempotencyKey: `partner_capture_${rideId}_${pb.delivery_fee_cents}` },
      );
    }

    const driverDollars = pb.driver_payout_cents / 100;
    const platformDollars = pb.platform_fee_cents / 100;

    await sql`
      UPDATE rides SET
        payment_captured = true,
        payment_captured_at = NOW(),
        platform_fee_amount = ${platformDollars},
        driver_payout_amount = ${driverDollars}
      WHERE id = ${rideId}
    `;
    await sql`UPDATE partner_bookings SET status = 'captured', updated_at = NOW() WHERE id = ${pb.id}`;

    // Ledger — mirror escrow's row shape. The platform row's user_id is the
    // driver id with role 'platform' (transaction_ledger.user_id is a real
    // users FK; 'platform' is only the role label), matching lib/payments/escrow.
    await sql`
      INSERT INTO transaction_ledger
        (ride_id, user_id, user_role, event_type, amount, direction, description, stripe_reference)
      VALUES
        (${rideId}, ${pb.rider_id}, 'rider', 'payment_captured', ${pb.delivery_fee_cents / 100}, 'debit', 'Partner delivery fee charged', ${pb.payment_intent_id}),
        (${rideId}, ${pb.driver_id}, 'driver', 'earnings', ${driverDollars}, 'credit', 'Partner delivery earnings', ${pb.payment_intent_id}),
        (${rideId}, ${pb.driver_id}, 'platform', 'platform_fee', ${platformDollars}, 'credit', 'Partner delivery commission', ${pb.payment_intent_id})
    `;

    publishAdminEvent('partner_captured', {
      partnerBookingId: pb.id,
      rideId,
      deliveryFeeCents: pb.delivery_fee_cents,
      platformFeeCents: pb.platform_fee_cents,
    }).catch(() => {});
    dispatchPartnerEvent(pb.partner_id, 'booking.captured', {
      booking_id: pb.post_id,
      ride_id: rideId,
      fee_split: {
        delivery_fee_cents: pb.delivery_fee_cents,
        platform_fee_cents: pb.platform_fee_cents,
        driver_payout_cents: pb.driver_payout_cents,
      },
    }).catch(() => {});

    return { handled: true, driverReceives: driverDollars, platformFee: platformDollars };
  } catch (e) {
    console.error('[partner/capture] capture failed:', e);
    publishAdminEvent('partner_capture_failed', {
      partnerBookingId: pb.id,
      rideId,
      reason: e instanceof Error ? e.message : String(e),
    }).catch(() => {});
    // handled:true so the ride-tier capture (wrong fees) does not run. The
    // uncaptured hold can be retried/handled out of band.
    return { handled: true, driverReceives: 0, platformFee: 0 };
  }
}

/** Cancel a held (uncaptured) delivery PI to release the authorization. */
export async function releasePartnerHold(paymentIntentId: string | null): Promise<void> {
  if (isMock() || isMockPi(paymentIntentId)) return;
  await stripe.paymentIntents
    .cancel(paymentIntentId as string)
    .catch((e) => console.error('[partner/capture] release (cancel PI) failed:', e));
}
