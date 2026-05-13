import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const isMock = process.env.STRIPE_MOCK === 'true';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://atl.hmucashride.com';

export async function POST() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Get or create Stripe customer
    const profileRows = await sql`
      SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${userId} LIMIT 1
    `;
    let customerId = (profileRows[0] as Record<string, unknown>)?.stripe_customer_id as string | null;

    if (!customerId && !isMock) {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkId);
      const email = clerkUser.primaryEmailAddress?.emailAddress
        || `${clerkUser.phoneNumbers?.[0]?.phoneNumber?.replace(/\D/g, '') || clerkId}@rider.hmucashride.com`;

      const customer = await stripe.customers.create({
        email,
        metadata: { userId, clerkId, type: 'rider' },
      });
      customerId = customer.id;

      await sql`UPDATE rider_profiles SET stripe_customer_id = ${customerId} WHERE user_id = ${userId}`;
    }

    if (isMock) {
      return NextResponse.json({ url: `${APP_URL}/rider/settings?tab=payment&setup=complete` });
    }

    // Create Checkout session in setup mode
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId!,
      payment_method_types: ['card'],
      success_url: `${APP_URL}/rider/settings?tab=payment&setup=complete`,
      cancel_url: `${APP_URL}/rider/settings?tab=payment`,
      metadata: { userId, clerkId },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Payment checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start payment setup' },
      { status: 500 }
    );
  }
}
