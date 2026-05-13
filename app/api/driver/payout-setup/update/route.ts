// POST /api/driver/payout-setup/update — Generate a Stripe dashboard link to update payout method
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT dp.stripe_account_id
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;

  if (!rows.length || !rows[0].stripe_account_id) {
    return NextResponse.json({ error: 'No payout account found. Set up payouts first.' }, { status: 400 });
  }

  const stripeAccountId = rows[0].stripe_account_id as string;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://atl.hmucashride.com';

  try {
    // Try login link first (for accounts that completed onboarding)
    const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
    return NextResponse.json({ url: loginLink.url });
  } catch {
    // If login link fails (account not fully onboarded), create an account link instead
    try {
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        type: 'account_onboarding',
        return_url: `${appUrl}/driver/payout-setup?setup=complete`,
        refresh_url: `${appUrl}/driver/payout-setup?setup=refresh`,
      });
      return NextResponse.json({ url: accountLink.url });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to generate update link' },
        { status: 500 }
      );
    }
  }
}
