import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const isMock = process.env.STRIPE_MOCK === 'true';

/**
 * POST — Create a SetupIntent for collecting payment method inline.
 * After the frontend confirms the SetupIntent, it calls GET /api/driver/upgrade
 * which creates the actual subscription with the saved payment method.
 */
export async function POST() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await sql`
      SELECT u.id as user_id, u.tier
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const driver = rows[0] as { user_id: string; tier: string };

    if (driver.tier === 'hmu_first') {
      return NextResponse.json({ error: 'Already on HMU First' }, { status: 400 });
    }

    if (isMock) {
      return NextResponse.json({ clientSecret: 'mock_secret_' + Date.now() });
    }

    // Get or create Stripe customer for this driver
    let custRows = await sql`
      SELECT stripe_customer_id FROM driver_profiles WHERE user_id = ${driver.user_id} LIMIT 1
    `;
    let stripeCustomerId = (custRows[0] as Record<string, unknown>)?.stripe_customer_id as string | null;

    if (!stripeCustomerId) {
      custRows = await sql`
        SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${driver.user_id} LIMIT 1
      `;
      stripeCustomerId = (custRows[0] as Record<string, unknown>)?.stripe_customer_id as string | null;
    }

    if (!stripeCustomerId) {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkId);
      const email = clerkUser.primaryEmailAddress?.emailAddress
        || clerkUser.emailAddresses?.[0]?.emailAddress
        || `${clerkUser.phoneNumbers?.[0]?.phoneNumber?.replace(/\D/g, '') || clerkId}@driver.hmucashride.com`;

      const customer = await stripe.customers.create({
        email,
        metadata: { userId: driver.user_id, clerkId, type: 'driver_subscription' },
      });
      stripeCustomerId = customer.id;

      await sql`
        UPDATE driver_profiles SET stripe_customer_id = ${stripeCustomerId} WHERE user_id = ${driver.user_id}
      `;
    }

    // Cancel any stale incomplete subscriptions
    try {
      const existingSubs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'incomplete',
        limit: 5,
      });
      for (const sub of existingSubs.data) {
        await stripe.subscriptions.cancel(sub.id);
      }
    } catch (e) {
      console.error('Failed to clean stale subs:', e);
    }

    // Check if customer already has a default payment method — skip form if so
    try {
      const customer = await stripe.customers.retrieve(stripeCustomerId) as Stripe.Customer;
      const defaultPm = customer.invoice_settings?.default_payment_method;
      if (defaultPm) {
        // Payment method on file — create subscription directly (one-tap)
        return NextResponse.json({
          hasPaymentMethod: true,
          customerId: stripeCustomerId,
        });
      }
      // Also check for any attached payment methods
      const methods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card',
        limit: 1,
      });
      if (methods.data.length > 0) {
        // Set as default and proceed
        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: { default_payment_method: methods.data[0].id },
        });
        return NextResponse.json({
          hasPaymentMethod: true,
          customerId: stripeCustomerId,
        });
      }
    } catch {
      // Non-fatal — fall through to SetupIntent
    }

    // No payment method on file — create SetupIntent to collect one
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      automatic_payment_methods: { enabled: true },
      usage: 'off_session',
      metadata: { userId: driver.user_id, clerkId, purpose: 'hmu_first_subscription' },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId,
    });
  } catch (error) {
    console.error('Inline upgrade error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
