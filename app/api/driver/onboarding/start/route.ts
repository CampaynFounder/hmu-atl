import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { createStripeConnectAccount, createOnboardingLink } from '@/lib/stripe/connect';

export async function POST() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    if (!stripeAccountId) {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(clerkId);
      const email = profile.email
        || clerkUser.primaryEmailAddress?.emailAddress
        || clerkUser.emailAddresses?.[0]?.emailAddress
        || '';
      const phone = clerkUser.primaryPhoneNumber?.phoneNumber
        || clerkUser.phoneNumbers?.[0]?.phoneNumber
        || '';

      // Stripe requires at least an email — generate a placeholder if phone-only signup
      const stripeEmail = email || (phone ? `${phone.replace(/\D/g, '')}@phone.hmucashride.com` : `${clerkId}@driver.hmucashride.com`);

      stripeAccountId = await createStripeConnectAccount({
        email: stripeEmail,
        firstName: profile.first_name,
        lastName: profile.last_name || '',
      });

      await sql`
        UPDATE driver_profiles
        SET stripe_account_id = ${stripeAccountId}
        WHERE user_id = ${userId}
      `;

      try {
        await clerk.users.updateUserMetadata(clerkId, {
          publicMetadata: { stripeAccountId },
        });
      } catch (e) {
        console.error('Failed to update Clerk metadata:', e);
      }
    }

    const onboardingUrl = await createOnboardingLink(stripeAccountId);

    return NextResponse.json({ onboardingUrl, stripeAccountId });
  } catch (error) {
    console.error('Driver onboarding start error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start onboarding' },
      { status: 500 }
    );
  }
}
