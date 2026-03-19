import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const isMock = process.env.STRIPE_MOCK === 'true';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://atl.hmucashride.com';

export async function createStripeConnectAccount(driver: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  if (isMock) return 'acct_mock_' + Date.now();

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: driver.email,
    business_type: 'individual',
    individual: {
      first_name: driver.firstName,
      last_name: driver.lastName,
      email: driver.email,
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    settings: {
      payouts: {
        schedule: { interval: 'manual' },
      },
    },
  });
  return account.id;
}

export async function createOnboardingLink(stripeAccountId: string): Promise<string> {
  if (isMock) return APP_URL + '/driver/payout-setup?mock=complete';

  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: 'account_onboarding',
    return_url: APP_URL + '/driver/payout-setup?setup=complete',
    refresh_url: APP_URL + '/driver/payout-setup?setup=refresh',
  });
  return link.url;
}

export async function checkOnboardingStatus(stripeAccountId: string): Promise<{
  complete: boolean;
  hasExternalAccount: boolean;
  last4: string | null;
  accountType: string | null;
  bankName: string | null;
  instantEligible: boolean;
}> {
  if (isMock) {
    return {
      complete: true,
      hasExternalAccount: true,
      last4: '4242',
      accountType: 'bank_account',
      bankName: 'Chase',
      instantEligible: false,
    };
  }

  const account = await stripe.accounts.retrieve(stripeAccountId, {
    expand: ['external_accounts'],
  });

  const complete = !!(account.charges_enabled && account.payouts_enabled);
  const externalAccounts = (account.external_accounts?.data || []) as Array<Record<string, any>>;
  const firstAccount = externalAccounts[0];

  return {
    complete,
    hasExternalAccount: externalAccounts.length > 0,
    last4: firstAccount?.last4 || null,
    accountType: firstAccount?.object || null, // 'bank_account' or 'card'
    bankName: firstAccount?.bank_name || firstAccount?.brand || null,
    instantEligible: firstAccount?.available_payout_methods?.includes('instant') ?? false,
  };
}

export { stripe };
