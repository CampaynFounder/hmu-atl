// POST /api/driver/payout-setup/session — Create Stripe AccountSession for embedded components
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
    return NextResponse.json({ error: 'No Stripe account found' }, { status: 400 });
  }

  const stripeAccountId = rows[0].stripe_account_id as string;

  try {
    const accountSession = await stripe.accountSessions.create({
      account: stripeAccountId,
      components: {
        payouts: {
          enabled: true,
          features: {
            instant_payouts: true,
            standard_payouts: true,
            edit_payout_schedule: false,
            external_account_collection: true,
          },
        },
        account_management: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
      },
    });

    return NextResponse.json({ clientSecret: accountSession.client_secret });
  } catch (error) {
    console.error('AccountSession error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
