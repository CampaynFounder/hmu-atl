import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import PayoutSetupClient from './payout-setup-client';

interface Props {
  searchParams: Promise<{ setup?: string }>;
}

export default async function PayoutSetupPage({ searchParams }: Props) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const { setup } = await searchParams;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/onboarding?type=driver');

  const userId = (userRows[0] as { id: string }).id;

  const profileRows = await sql`
    SELECT stripe_account_id, stripe_onboarding_complete,
           stripe_external_account_last4, stripe_external_account_type,
           stripe_external_account_bank, payout_setup_complete
    FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
  `;
  if (!profileRows.length) redirect('/onboarding?type=driver');

  const profile = profileRows[0] as Record<string, unknown>;

  return (
    <Suspense fallback={
      <div style={{ background: '#080808', minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 24, height: 24, border: '2px solid #00E676', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      </div>
    }>
      <PayoutSetupClient
        initialStatus={{
          stripeAccountId: (profile.stripe_account_id as string) || null,
          stripeComplete: !!(profile.stripe_onboarding_complete),
          hasExternalAccount: !!(profile.stripe_external_account_last4),
          last4: (profile.stripe_external_account_last4 as string) || null,
          accountType: (profile.stripe_external_account_type as string) || null,
          bankName: (profile.stripe_external_account_bank as string) || null,
          setupComplete: !!(profile.payout_setup_complete),
        }}
        shouldRefresh={setup === 'complete'}
      />
    </Suspense>
  );
}
