import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const isMock = process.env.STRIPE_MOCK === 'true';

/**
 * POST — Create a SetupIntent for saving a driver's payment method
 * (for HMU First subscription and Cash Pack purchases — NOT for ride payouts)
 */
export async function POST() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await sql`
      SELECT dp.user_id, dp.stripe_customer_id
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const driver = rows[0] as { user_id: string; stripe_customer_id: string | null };

    if (isMock) {
      return NextResponse.json({ clientSecret: 'seti_mock_' + Date.now() });
    }

    // Get or create Stripe customer for this driver
    let customerId = driver.stripe_customer_id;

    if (!customerId) {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkId);
      const email = clerkUser.primaryEmailAddress?.emailAddress
        || clerkUser.emailAddresses?.[0]?.emailAddress
        || `${clerkUser.phoneNumbers?.[0]?.phoneNumber?.replace(/\D/g, '') || clerkId}@driver.hmucashride.com`;

      const customer = await stripe.customers.create({
        email,
        metadata: { userId: driver.user_id, clerkId, type: 'driver_purchases' },
      });
      customerId = customer.id;

      await sql`UPDATE driver_profiles SET stripe_customer_id = ${customerId} WHERE user_id = ${driver.user_id}`;
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      usage: 'off_session',
      metadata: { userId: driver.user_id, clerkId, purpose: 'driver_payment_method' },
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret, customerId });
  } catch (error) {
    console.error('Driver payment setup error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

/**
 * GET — Check if driver has a payment method on file
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await sql`
      SELECT dp.stripe_customer_id
      FROM driver_profiles dp
      JOIN users u ON u.id = dp.user_id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const customerId = (rows[0] as Record<string, unknown>).stripe_customer_id as string | null;

    if (!customerId || isMock) {
      return NextResponse.json({ hasPaymentMethod: false });
    }

    const methods = await stripe.paymentMethods.list({
      customer: customerId,
      limit: 1,
    });

    const pm = methods.data[0];

    return NextResponse.json({
      hasPaymentMethod: methods.data.length > 0,
      brand: pm?.card?.brand || null,
      last4: pm?.card?.last4 || null,
    });
  } catch (error) {
    console.error('Driver payment check error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
