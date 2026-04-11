// POST /api/driver/payout-setup/session — Create Stripe AccountSession for embedded components
import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';
import { createStripeConnectAccount } from '@/lib/stripe/connect';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT u.id as user_id, dp.stripe_account_id, dp.first_name, dp.last_name, dp.email
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
  }

  const profile = rows[0] as {
    user_id: string;
    stripe_account_id: string | null;
    first_name: string;
    last_name: string;
    email: string;
  };

  let stripeAccountId = profile.stripe_account_id;

  // Auto-create Connect account if missing so embedded onboarding can start from scratch
  if (!stripeAccountId) {
    try {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkId);
      const email = profile.email
        || clerkUser.primaryEmailAddress?.emailAddress
        || clerkUser.emailAddresses?.[0]?.emailAddress
        || '';
      const phone = clerkUser.primaryPhoneNumber?.phoneNumber
        || clerkUser.phoneNumbers?.[0]?.phoneNumber
        || '';
      const stripeEmail = email || (phone ? `${phone.replace(/\D/g, '')}@phone.hmucashride.com` : `${clerkId}@driver.hmucashride.com`);

      stripeAccountId = await createStripeConnectAccount({
        email: stripeEmail,
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
      });

      await sql`
        UPDATE driver_profiles SET stripe_account_id = ${stripeAccountId} WHERE user_id = ${profile.user_id}
      `;

      try {
        await clerk.users.updateUserMetadata(clerkId, {
          publicMetadata: { stripeAccountId },
        });
      } catch (e) {
        console.error('Failed to update Clerk metadata:', e);
      }
    } catch (error) {
      console.error('Failed to auto-create Stripe Connect account:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create Stripe account' },
        { status: 500 }
      );
    }
  }

  try {
    const accountSession = await stripe.accountSessions.create({
      account: stripeAccountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
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

    return NextResponse.json({ clientSecret: accountSession.client_secret, stripeAccountId });
  } catch (error) {
    console.error('AccountSession error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
