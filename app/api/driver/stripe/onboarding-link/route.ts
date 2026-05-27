// POST /api/driver/stripe/onboarding-link
// Returns a Stripe account link for native mobile Stripe Connect onboarding.
// Mobile opens this URL in WebBrowser.openAuthSessionAsync with return scheme
// `hmuatl://` — Stripe redirects back to return_url on completion, and the
// OS hands control back to the app.
//
// This is the correct pattern for React Native — the embedded
// @stripe/react-connect-js ConnectAccountOnboarding component is web-only.
// The web app uses that; native mobile uses this account link approach.
import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';
import { createStripeConnectAccount } from '@/lib/stripe/connect';
import { checkRateLimit } from '@/lib/rate-limit/check';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});

const APP_SCHEME = 'hmuatl';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://atl.hmucashride.com';

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit: 10 link creations per driver per hour
  const rl = await checkRateLimit({ key: `payout_link:${clerkId}`, limit: 10, windowSeconds: 3600 });
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  const profileRows = await sql`
    SELECT stripe_account_id, first_name, last_name, email
    FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
  `;
  if (!profileRows.length) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

  const profile = profileRows[0] as {
    stripe_account_id: string | null;
    first_name: string;
    last_name: string;
    email: string;
  };

  let stripeAccountId = profile.stripe_account_id;

  // Auto-create Connect account if driver hasn't started onboarding yet
  if (!stripeAccountId) {
    try {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkId);
      const email =
        profile.email ||
        clerkUser.primaryEmailAddress?.emailAddress ||
        clerkUser.emailAddresses?.[0]?.emailAddress ||
        `${clerkId}@driver.hmucashride.com`;

      stripeAccountId = await createStripeConnectAccount({
        email,
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
      });

      await sql`UPDATE driver_profiles SET stripe_account_id = ${stripeAccountId} WHERE user_id = ${userId}`;

      try {
        await clerk.users.updateUserMetadata(clerkId, {
          publicMetadata: { stripeAccountId },
        });
      } catch { /* non-critical */ }
    } catch (error) {
      console.error('[stripe/onboarding-link] Failed to create Connect account:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create Stripe account' },
        { status: 500 },
      );
    }
  }

  // Account link — expires in 5 min. Mobile opens in WebBrowser.openAuthSessionAsync.
  // return_url: app resumes here after driver completes onboarding.
  // refresh_url: Stripe redirects here if the link expires; mobile handles by
  //              calling this endpoint again to get a fresh link.
  const link = await stripe.accountLinks.create({
    account: stripeAccountId!,
    type: 'account_onboarding',
    return_url: `${APP_SCHEME}://payout-complete`,
    refresh_url: `${APP_URL}/driver/payout-setup?mobile_refresh=1`,
  });

  return NextResponse.json({ url: link.url, stripeAccountId });
}
