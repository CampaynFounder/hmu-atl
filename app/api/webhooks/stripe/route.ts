import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { publishAdminEvent } from '@/lib/ably/server';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ─── Ride escrow ────────────────────────────────────────────────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const rideId = pi.metadata?.rideId;
        if (rideId) {
          await sql`
            UPDATE rides SET status = 'completed', completed_at = NOW()
            WHERE id = ${rideId} AND payment_intent_id = ${pi.id}
          `;
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const rideId = pi.metadata?.rideId;
        if (rideId) {
          await sql`
            UPDATE rides SET status = 'cancelled'
            WHERE id = ${rideId} AND payment_intent_id = ${pi.id}
          `;
          // Cascade: cancel calendar booking + linked post
          const { cancelRideBooking } = await import('@/lib/schedule/conflicts');
          cancelRideBooking(rideId).catch(() => {});
          const postRows = await sql`SELECT hmu_post_id FROM rides WHERE id = ${rideId} LIMIT 1`;
          const postId = (postRows[0] as Record<string, unknown>)?.hmu_post_id as string;
          if (postId) await sql`UPDATE hmu_posts SET status = 'cancelled' WHERE id = ${postId}`.catch(() => {});
        }
        break;
      }

      case 'payment_intent.canceled': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const rideId = pi.metadata?.rideId;
        if (rideId) {
          await sql`
            UPDATE rides SET status = 'cancelled'
            WHERE id = ${rideId} AND payment_intent_id = ${pi.id}
          `;
          // Cascade: cancel calendar booking + linked post
          const { cancelRideBooking } = await import('@/lib/schedule/conflicts');
          cancelRideBooking(rideId).catch(() => {});
          const postRows = await sql`SELECT hmu_post_id FROM rides WHERE id = ${rideId} LIMIT 1`;
          const postId = (postRows[0] as Record<string, unknown>)?.hmu_post_id as string;
          if (postId) await sql`UPDATE hmu_posts SET status = 'cancelled' WHERE id = ${postId}`.catch(() => {});
        }
        break;
      }

      // ─── Stripe Connect (driver accounts) ──────────────────────────────────
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const chargesEnabled = account.charges_enabled;
        const payoutsEnabled = account.payouts_enabled;

        if (chargesEnabled && payoutsEnabled) {
          // Mark driver as fully activated
          await sql`
            UPDATE users
            SET account_status = 'active', updated_at = NOW()
            WHERE id IN (
              SELECT user_id FROM driver_profiles
              WHERE stripe_account_id = ${account.id}
            )
          `;

          // Check if this is a new payout-ready transition — notify driver via SMS
          const driverRows = await sql`
            SELECT dp.phone, dp.stripe_onboarding_complete, dp.first_name, u.id as user_id
            FROM driver_profiles dp
            JOIN users u ON u.id = dp.user_id
            WHERE dp.stripe_account_id = ${account.id}
            LIMIT 1
          `;

          if (driverRows.length) {
            const driver = driverRows[0];
            const wasAlreadyComplete = driver.stripe_onboarding_complete;

            // Update onboarding status
            await sql`
              UPDATE driver_profiles
              SET stripe_onboarding_complete = true, updated_at = NOW()
              WHERE stripe_account_id = ${account.id}
            `;

            // Only SMS on first transition to payout-ready
            if (!wasAlreadyComplete && driver.phone) {
              await sendSms(
                driver.phone as string,
                `HMU ATL: ${driver.first_name || 'Hey'}, your payout account is verified! You can now cash out your earnings. atl.hmucashride.com/driver/home`,
                { userId: driver.user_id as string, eventType: 'payout_ready' }
              );
            }
          }
        }
        break;
      }

      case 'transfer.created': {
        const transfer = event.data.object as Stripe.Transfer;
        const rideId = transfer.metadata?.rideId;
        if (rideId) {
          await sql`
            INSERT INTO payouts (ride_id, driver_id, gross_amount, net_amount, stripe_transfer_id, paid_at)
            SELECT
              ${rideId}::uuid,
              driver_id,
              amount,
              amount,
              ${transfer.id},
              NOW()
            FROM rides WHERE id = ${rideId}
            ON CONFLICT DO NOTHING
          `;
        }
        break;
      }

      // transfer.failed is not a Stripe webhook event — handle via transfer.created status check


      // ─── HMU First subscription ─────────────────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (customerId) {
          const isActive = sub.status === 'active' || sub.status === 'trialing';
          const tier = isActive ? 'hmu_first' : 'free';
          await sql`
            UPDATE users SET tier = ${tier}, updated_at = NOW()
            WHERE id IN (
              SELECT user_id FROM driver_profiles WHERE stripe_customer_id = ${customerId}
              UNION
              SELECT user_id FROM rider_profiles WHERE stripe_customer_id = ${customerId}
            )
          `;
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (customerId) {
          await sql`
            UPDATE users SET tier = 'free', updated_at = NOW()
            WHERE id IN (
              SELECT user_id FROM driver_profiles WHERE stripe_customer_id = ${customerId}
              UNION
              SELECT user_id FROM rider_profiles WHERE stripe_customer_id = ${customerId}
            )
          `;
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await sql`
            UPDATE users SET tier = 'hmu_first', updated_at = NOW()
            WHERE id IN (
              SELECT user_id FROM driver_profiles WHERE stripe_customer_id = ${customerId}
              UNION
              SELECT user_id FROM rider_profiles WHERE stripe_customer_id = ${customerId}
            )
          `;
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          // Grace period — don't downgrade immediately, Stripe will retry
          console.warn('HMU First invoice payment failed for customer:', customerId);
        }
        break;
      }

      // ─── Refunds ─────────────────────────────────────────────────────────────
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const rideId = charge.metadata?.rideId;
        if (rideId) {
          await sql`
            UPDATE rides SET status = 'refunded', updated_at = NOW()
            WHERE id = ${rideId}
          `;
          publishAdminEvent('ride_refunded', { rideId, amount: charge.amount_refunded / 100 }).catch(() => {});
        }
        break;
      }

      // ─── Chargebacks ──────────────────────────────────────────────────────────
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
        if (!chargeId) break;
        // Find ride by payment_intent_id from the charge
        const chargeObj = await stripe.charges.retrieve(chargeId);
        const piId = typeof chargeObj.payment_intent === 'string'
          ? chargeObj.payment_intent
          : chargeObj.payment_intent?.id;
        if (piId) {
          await sql`
            UPDATE rides SET
              status = 'disputed',
              updated_at = NOW()
            WHERE payment_intent_id = ${piId}
          `;
          publishAdminEvent('chargeback_created', {
            disputeId: dispute.id,
            amount: dispute.amount / 100,
            reason: dispute.reason,
          }).catch(() => {});
        }
        break;
      }

      // ─── Payout delivery tracking ───────────────────────────��─────────────────
      case 'payout.paid': {
        const payout = event.data.object as Stripe.Payout;
        // This fires on connected account payouts — log for monitoring
        publishAdminEvent('payout_delivered', {
          payoutId: payout.id,
          amount: payout.amount / 100,
          destination: payout.destination,
        }).catch(() => {});
        break;
      }

      case 'payout.failed': {
        const payout = event.data.object as Stripe.Payout;
        publishAdminEvent('payout_failed', {
          payoutId: payout.id,
          amount: payout.amount / 100,
          failureCode: payout.failure_code,
          failureMessage: payout.failure_message,
        }).catch(() => {});
        break;
      }

      default:
        // Unhandled event — log and return 200 so Stripe doesn't retry
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
