import Stripe from 'stripe';

// Lazy-initialize Stripe — process.env may not be available at module scope
// on Cloudflare Workers with OpenNext
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return _stripe;
}

function isMock(): boolean {
  return process.env.STRIPE_MOCK === 'true';
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://atl.hmucashride.com';
}

export async function createStripeConnectAccount(driver: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<string> {
  if (isMock()) return 'acct_mock_' + Date.now();

  const account = await getStripe().accounts.create({
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

/**
 * @deprecated VIOLATES IN-APP-ONLY POLICY (CLAUDE.md § STRIPE INTEGRATION).
 * Returns a Stripe-hosted onboarding URL (connect.stripe.com). Per CLAUDE.md:
 * "Live leaks (do NOT add new callers — Phase B will rip these out):
 *  - lib/stripe/connect.ts:createOnboardingLink — helper that returns a hosted URL. Audit callers + delete."
 * Use /driver/payout-setup page (renders embedded ConnectAccountOnboarding) instead.
 */
export async function createOnboardingLink(stripeAccountId: string): Promise<string> {
  if (isMock()) return getAppUrl() + '/driver/payout-setup?mock=complete';

  const link = await getStripe().accountLinks.create({
    account: stripeAccountId,
    type: 'account_onboarding',
    return_url: getAppUrl() + '/driver/payout-setup?setup=complete',
    refresh_url: getAppUrl() + '/driver/payout-setup?setup=refresh',
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
  if (isMock()) {
    return {
      complete: true,
      hasExternalAccount: true,
      last4: '4242',
      accountType: 'bank_account',
      bankName: 'Chase',
      instantEligible: false,
    };
  }

  const account = await getStripe().accounts.retrieve(stripeAccountId, {
    expand: ['external_accounts'],
  });

  const complete = !!(account.charges_enabled && account.payouts_enabled);
  const externalAccounts = (account.external_accounts?.data || []) as unknown as Array<Record<string, unknown>>;
  const firstAccount = externalAccounts[0];

  return {
    complete,
    hasExternalAccount: externalAccounts.length > 0,
    last4: (firstAccount?.last4 as string) || null,
    accountType: (firstAccount?.object as string) || null,
    bankName: (firstAccount?.bank_name as string) || (firstAccount?.brand as string) || null,
    instantEligible: (firstAccount?.available_payout_methods as string[])?.includes('instant') ?? false,
  };
}

// Export lazy getter for use in escrow.ts etc
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
