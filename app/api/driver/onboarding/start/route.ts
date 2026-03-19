import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { createStripeConnectAccount, createOnboardingLink } from '@/lib/stripe/connect';

export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get user + driver profile
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

  // Create Stripe Connect account if not exists
  if (!stripeAccountId) {
    // Get email from Clerk if not in profile
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(clerkId);
    const email = profile.email || clerkUser.primaryEmailAddress?.emailAddress || '';

    stripeAccountId = await createStripeConnectAccount({
      email,
      firstName: profile.first_name,
      lastName: profile.last_name || '',
    });

    // Save to DB
    await sql`
      UPDATE driver_profiles
      SET stripe_account_id = ${stripeAccountId}
      WHERE user_id = ${userId}
    `;

    // Save to Clerk metadata
    await clerk.users.updateUserMetadata(clerkId, {
      publicMetadata: { stripeAccountId },
    });
  }

  // Create onboarding link
  const onboardingUrl = await createOnboardingLink(stripeAccountId);

  return NextResponse.json({ onboardingUrl, stripeAccountId });
}
