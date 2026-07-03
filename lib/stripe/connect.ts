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

// ─── Option B: Custom accounts (fully native KYC, no Stripe-hosted UI) ────────
// Gated behind the driver_payout_native_forms feature flag. Custom accounts let
// the platform collect KYC + attach the payout method via the API — but the
// platform then owns ALL verification/compliance (ToS acceptance, requirements).
// Requires Stripe approval for Custom accounts before enabling in production.

export async function createCustomConnectAccount(driver: {
  email: string;
  firstName: string;
  lastName: string;
  ip: string;        // required for tos_acceptance on Custom accounts
  phone?: string;
}): Promise<string> {
  if (isMock()) return 'acct_customock_' + Date.now();

  const account = await getStripe().accounts.create({
    type: 'custom',
    country: 'US',
    email: driver.email,
    business_type: 'individual',
    business_profile: {
      mcc: '4121', // Taxicabs and Limousines
      product_description: 'Peer-to-peer ride payouts on HMU ATL',
    },
    individual: {
      first_name: driver.firstName,
      last_name: driver.lastName,
      email: driver.email,
      ...(driver.phone ? { phone: driver.phone } : {}),
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    // The driver accepts Stripe's Connected Account Agreement in-app; we record
    // the acceptance timestamp + their IP as Stripe requires for Custom accounts.
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: driver.ip,
    },
    settings: {
      payouts: { schedule: { interval: 'manual' } },
    },
  });
  return account.id;
}

export interface AccountRequirements {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  currentlyDue: string[];
  eventuallyDue: string[];
  pastDue: string[];
  disabledReason: string | null;
  hasExternalAccount: boolean;
}

export async function getAccountRequirements(stripeAccountId: string): Promise<AccountRequirements> {
  if (isMock()) {
    return {
      chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true,
      currentlyDue: [], eventuallyDue: [], pastDue: [], disabledReason: null, hasExternalAccount: true,
    };
  }
  const a = await getStripe().accounts.retrieve(stripeAccountId, { expand: ['external_accounts'] });
  const req = a.requirements;
  return {
    chargesEnabled: !!a.charges_enabled,
    payoutsEnabled: !!a.payouts_enabled,
    detailsSubmitted: !!a.details_submitted,
    currentlyDue: req?.currently_due ?? [],
    eventuallyDue: req?.eventually_due ?? [],
    pastDue: req?.past_due ?? [],
    disabledReason: req?.disabled_reason ?? null,
    hasExternalAccount: ((a.external_accounts?.data as unknown[])?.length ?? 0) > 0,
  };
}

export async function updateCustomAccountIndividual(
  stripeAccountId: string,
  individual: {
    dob?: { day: number; month: number; year: number };
    ssnLast4?: string;
    idNumber?: string;   // full SSN — only when Stripe escalates requirements
    phone?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    address?: { line1: string; line2?: string; city: string; state: string; postal_code: string };
  },
): Promise<void> {
  if (isMock()) return;
  const payload: Stripe.AccountUpdateParams.Individual = {};
  if (individual.firstName) payload.first_name = individual.firstName;
  if (individual.lastName) payload.last_name = individual.lastName;
  if (individual.dob) payload.dob = individual.dob;
  if (individual.ssnLast4) payload.ssn_last_4 = individual.ssnLast4;
  if (individual.idNumber) payload.id_number = individual.idNumber;
  if (individual.phone) payload.phone = individual.phone;
  if (individual.email) payload.email = individual.email;
  if (individual.address) payload.address = { country: 'US', ...individual.address };
  await getStripe().accounts.update(stripeAccountId, { individual: payload });
}

export async function attachExternalAccount(
  stripeAccountId: string,
  token: string,   // a Stripe token: btok_… (bank) or tok_… (debit card), created client-side
): Promise<{ last4: string | null; type: string; bankName: string | null; instantEligible: boolean }> {
  if (isMock()) return { last4: '4242', type: 'bank_account', bankName: 'Test Bank', instantEligible: false };
  const ext = await getStripe().accounts.createExternalAccount(stripeAccountId, {
    external_account: token,
    default_for_currency: true,
  }) as unknown as Record<string, unknown>;
  return {
    last4: (ext.last4 as string) ?? null,
    type: (ext.object as string) ?? 'bank_account',
    bankName: (ext.bank_name as string) ?? (ext.brand as string) ?? null,
    instantEligible: (ext.available_payout_methods as string[] | undefined)?.includes('instant') ?? false,
  };
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
