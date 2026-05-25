import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { renderTemplate } from '@/lib/sms/templates';
import { publishAdminEvent } from '@/lib/ably/server';
import { syncTierForCustomer } from '@/lib/stripe/sync-tier';

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

  // Claim this event_id. Stripe retries on 5xx/timeout; without dedup the
  // handlers below would fire duplicate side effects. If the INSERT returns
  // no rows the event was already processed (or claimed in flight) — return
  // 200 so Stripe stops retrying.
  const claim = await sql`
    INSERT INTO processed_webhook_events (event_id, event_type)
    VALUES (${event.id}, ${event.type})
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `;
  if (claim.length === 0) {
    return NextResponse.json({ received: true, deduped: true });
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
              const firstName = (driver.first_name as string | null) || 'Hey';
              const fallback = `HMU ATL: ${firstName}, your payout account is verified! You can now cash out your earnings. atl.hmucashride.com/driver/home`;
              const message = (await renderTemplate('payout_ready', { firstName })) ?? fallback;
              await sendSms(
                driver.phone as string,
                message,
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
          await syncTierForCustomer(customerId, isActive ? 'hmu_first' : 'free');
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (customerId) {
          await syncTierForCustomer(customerId, 'free');
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await syncTierForCustomer(customerId, 'hmu_first');
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

      // Fires on a connected account whenever Stripe-available (standard
      // payout) balance changes. We SMS the driver on each positive delta
      // (new funds cleared) and quietly track drops (driver cashed out) so
      // the watermark never sticks high and blocks future notifications.
      // The SMS quotes the delta — what just cleared — not the cumulative
      // balance, so a driver who earns $10 today and $30 tomorrow sees two
      // distinct "your $X just cleared" texts.
      //
      // Concurrency: two balance.available webhooks for the same Connect
      // account can fire close together (e.g. two captures landing seconds
      // apart). The previous SELECT-then-UPDATE allowed both handlers to
      // read the same `prev`, compute the same `delta`, and SMS twice for
      // overlapping windows. The single-statement UPDATE below uses
      // FOR UPDATE in the inner select to serialize concurrent handlers on
      // the row — each observes its predecessor's post-update value, so
      // deltas partition the cleared funds rather than double-count them.
      case 'balance.available': {
        const balance = event.data.object as Stripe.Balance;
        const accountId = event.account; // Connect events populate this
        if (!accountId) break;

        const currentAvailableCents = balance.available
          .filter(b => b.currency === 'usd')
          .reduce((sum, b) => sum + b.amount, 0);

        // Atomic claim: advance watermark and return the value it had before.
        // The FOR UPDATE row lock blocks any concurrent handler for the same
        // account until this statement returns.
        const claimed = await sql`
          UPDATE driver_profiles AS dp
          SET last_notified_available_cents = ${currentAvailableCents},
              updated_at = NOW()
          FROM (
            SELECT user_id, phone, display_name,
                   COALESCE(last_notified_available_cents, 0) AS prev
            FROM driver_profiles
            WHERE stripe_account_id = ${accountId}
            FOR UPDATE
          ) AS old
          WHERE dp.stripe_account_id = ${accountId}
          RETURNING old.user_id, old.phone, old.display_name, old.prev
        `;

        if (claimed.length === 0) break;
        const driver = claimed[0] as {
          user_id: string;
          phone: string | null;
          display_name: string | null;
          prev: number;
        };

        const deltaCents = currentAvailableCents - driver.prev;

        // Drops (cashouts), no-ops, and out-of-order older events: watermark
        // already moved; nothing to SMS for.
        if (deltaCents <= 0 || !driver.phone) break;

        const firstName =
          (driver.display_name ?? '').trim().split(/\s+/)[0] || 'Hey';
        const clearedDollars = (deltaCents / 100).toFixed(2);
        const fallback =
          `HMU ATL: ${firstName}, your $${clearedDollars} just cleared! Cash out at atl.hmucashride.com/driver/home`;
        const smsBody = (await renderTemplate('balance_available', { firstName, clearedDollars })) ?? fallback;

        const result = await sendSms(driver.phone, smsBody, {
          userId: driver.user_id,
          eventType: 'balance_available',
        });
        if (!result.success) {
          // Roll back the watermark we claimed so Stripe's retry can re-fire.
          // The CAS condition ensures we don't overwrite a newer concurrent
          // advance — if someone moved past us, their SMS already covered
          // these funds.
          await sql`
            UPDATE driver_profiles
            SET last_notified_available_cents = ${driver.prev}
            WHERE stripe_account_id = ${accountId}
              AND last_notified_available_cents = ${currentAvailableCents}
          `;
          throw new Error(`balance.available SMS failed: ${result.error}`);
        }
        break;
      }

      default:
        // Unhandled event — log and return 200 so Stripe doesn't retry
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    // Release the idempotency claim so Stripe's retry can re-process. Best
    // effort — if this DELETE itself fails the event will be wedged and need
    // manual cleanup, but we still want to return 500 so Stripe knows to
    // retry.
    await sql`DELETE FROM processed_webhook_events WHERE event_id = ${event.id}`
      .catch((e: unknown) => console.error('Failed to release webhook claim:', e));
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
