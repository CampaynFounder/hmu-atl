import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkOnboardingStatus } from '@/lib/stripe/connect';
import { getPayoutMode } from '@/lib/payments/payout-mode';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  const profileRows = await sql`
    SELECT stripe_account_id, stripe_onboarding_complete,
           stripe_external_account_last4, stripe_external_account_type,
           stripe_external_account_bank, stripe_instant_eligible,
           payout_method, payout_setup_complete
    FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
  `;
  if (!profileRows.length) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });

  const profile = profileRows[0] as Record<string, unknown>;

  // If has stripe account, check live status
  let stripeStatus = null;
  if (profile.stripe_account_id) {
    try {
      stripeStatus = await checkOnboardingStatus(profile.stripe_account_id as string);

      // Sync status to DB if changed
      if (stripeStatus.complete && !profile.stripe_onboarding_complete) {
        await sql`
          UPDATE driver_profiles
          SET stripe_onboarding_complete = true,
              stripe_external_account_last4 = ${stripeStatus.last4},
              stripe_external_account_type = ${stripeStatus.accountType},
              stripe_external_account_bank = ${stripeStatus.bankName},
              stripe_instant_eligible = ${stripeStatus.instantEligible},
              payout_setup_complete = ${stripeStatus.hasExternalAccount},
              payout_method = ${stripeStatus.accountType === 'card' ? 'debit' : 'bank'}
          WHERE user_id = ${userId}
        `;
      }
    } catch (e) {
      console.error('Failed to check Stripe status:', e);
    }
  }

  // Determine next step
  let nextStep: string;
  if (!profile.stripe_account_id) {
    nextStep = 'stripe_onboarding';
  } else if (!stripeStatus?.complete && !profile.stripe_onboarding_complete) {
    nextStep = 'stripe_onboarding';
  } else if (!stripeStatus?.hasExternalAccount && !profile.stripe_external_account_last4) {
    nextStep = 'add_payout_method';
  } else {
    nextStep = 'complete';
  }

  // Which onboarding UX the mobile app should render — superadmin-selected at
  // /admin/payout-mode ('browser' | 'embedded' | 'native'), resolved at runtime
  // so each can be tested on-device without a rebuild:
  //   'browser'  — in-app Safari sheet over Stripe hosted onboarding (default).
  //   'embedded' — Stripe embedded ConnectJS in an in-app WebView.
  //   'native'   — fully native KYC forms (Custom accounts).
  // Native requires a Custom account; an existing Express account can't convert,
  // so a driver who already has an account falls back to 'browser' even when the
  // selected mode is 'native'.
  const selectedMode = await getPayoutMode();
  const payoutMode: 'browser' | 'embedded' | 'native' =
    selectedMode === 'native' && profile.stripe_account_id ? 'browser' : selectedMode;

  return NextResponse.json({
    stripeAccountId: profile.stripe_account_id || null,
    stripeComplete: !!(profile.stripe_onboarding_complete || stripeStatus?.complete),
    stripeAccount: (profile.stripe_external_account_last4 || stripeStatus?.last4) ? {
      last4: profile.stripe_external_account_last4 || stripeStatus?.last4,
      type: profile.stripe_external_account_type || stripeStatus?.accountType,
      bank: profile.stripe_external_account_bank || stripeStatus?.bankName,
      instantEligible: profile.stripe_instant_eligible || stripeStatus?.instantEligible,
    } : null,
    payoutMethod: profile.payout_method,
    setupComplete: !!(profile.payout_setup_complete || (stripeStatus?.complete && stripeStatus?.hasExternalAccount)),
    nextStep,
    payoutMode,
  });
}
