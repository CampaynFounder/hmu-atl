import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const isMock = process.env.STRIPE_MOCK === 'true';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://atl.hmucashride.com';

// POST — create Checkout session for HMU First subscription
export async function POST() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await sql`
      SELECT u.id as user_id, u.tier, dp.stripe_account_id
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const driver = rows[0] as { user_id: string; tier: string; stripe_account_id: string | null };

    if (driver.tier === 'hmu_first') {
      return NextResponse.json({ error: 'Already on HMU First' }, { status: 400 });
    }

    if (isMock) {
      return NextResponse.json({
        sessionId: 'cs_mock_' + Date.now(),
        url: APP_URL + '/driver/home?upgraded=1',
      });
    }

    // Get or create Stripe customer for subscription billing
    // (separate from Connect account — this is for charging the driver)
    let customerRows = await sql`
      SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${driver.user_id} LIMIT 1
    `;
    let stripeCustomerId = (customerRows[0] as Record<string, unknown>)?.stripe_customer_id as string | null;

    if (!stripeCustomerId) {
      // Check driver_profiles for a customer ID or create one
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
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{
        price: process.env.HMU_FIRST_PRICE_ID!,
        quantity: 1,
      }],
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      success_url: `${APP_URL}/driver/home?upgraded=1`,
      cancel_url: `${APP_URL}/driver/home`,
      subscription_data: {
        metadata: { userId: driver.user_id, clerkId },
      },
      metadata: { userId: driver.user_id, clerkId },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Upgrade error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upgrade failed' },
      { status: 500 }
    );
  }
}

// GET — confirm upgrade (called after successful checkout)
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await sql`
      SELECT u.id as user_id, u.tier
      FROM users u WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const user = rows[0] as { user_id: string; tier: string };

    // Update tier
    await sql`UPDATE users SET tier = 'hmu_first', updated_at = NOW() WHERE id = ${user.user_id}`;
    await sql`UPDATE driver_profiles SET subscription_status = 'hmu_first' WHERE user_id = ${user.user_id}`;

    // Update Clerk metadata
    try {
      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(clerkId, {
        publicMetadata: { tier: 'hmu_first' },
      });
    } catch (e) {
      console.error('Failed to update Clerk tier:', e);
    }

    // Trigger instant payout if balance exists
    try {
      const dpRows = await sql`
        SELECT stripe_account_id FROM driver_profiles WHERE user_id = ${user.user_id} LIMIT 1
      `;
      const stripeAccountId = (dpRows[0] as Record<string, unknown>)?.stripe_account_id as string;

      if (stripeAccountId && !isMock) {
        const balance = await stripe.balance.retrieve({ stripeAccount: stripeAccountId });
        const available = balance.available.reduce((sum, b) => sum + b.amount, 0);

        if (available > 0) {
          await stripe.payouts.create(
            { amount: available, currency: 'usd', method: 'instant' },
            { stripeAccount: stripeAccountId }
          ).catch(() => {
            // Instant not available — do standard
            return stripe.payouts.create(
              { amount: available, currency: 'usd', method: 'standard' },
              { stripeAccount: stripeAccountId }
            );
          });
        }
      }
    } catch (e) {
      console.error('Post-upgrade payout failed:', e);
    }

    return NextResponse.json({ success: true, tier: 'hmu_first' });
  } catch (error) {
    console.error('Confirm upgrade error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm upgrade' },
      { status: 500 }
    );
  }
}
