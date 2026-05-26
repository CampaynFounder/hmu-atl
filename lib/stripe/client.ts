// Central Stripe client — import { stripeClient, isMock } from here.
// Always uses createFetchHttpClient() for CF Workers compatibility.
// Lazy-initialized so the module is safe to import during build.

import Stripe from 'stripe';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover',
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  if (!_stripe) throw new Error('STRIPE_SECRET_KEY not configured');
  return _stripe;
}

// Proxy so callers get a stable reference and getStripe() fires on first use.
export const stripeClient = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const isMock = process.env.STRIPE_MOCK === 'true';

// Keep IS_MOCK for any existing internal callers in this file.
const IS_MOCK = isMock;

// Mock ID generators
function generateMockCustomerId(): string {
  return `cus_mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateMockAccountId(): string {
  return `acct_mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create Stripe Customer (for all users)
 * Returns real Stripe Customer ID or mock ID based on STRIPE_MOCK flag
 */
export async function createCustomer(params: {
  clerkId: string;
  email: string;
  name: string;
}): Promise<string> {
  if (IS_MOCK) {
    console.log('[STRIPE MOCK] Creating customer:', params);
    return generateMockCustomerId();
  }

  const customer = await getStripe().customers.create({
    email: params.email,
    name: params.name,
    metadata: {
      clerk_id: params.clerkId,
    },
  });

  return customer.id;
}

/**
 * Create Stripe Connect Express Account (for drivers only)
 * Returns real Stripe Account ID or mock ID based on STRIPE_MOCK flag
 */
export async function createConnectAccount(params: {
  clerkId: string;
  email: string;
}): Promise<string> {
  if (IS_MOCK) {
    console.log('[STRIPE MOCK] Creating Connect account:', params);
    return generateMockAccountId();
  }

  const account = await getStripe().accounts.create({
    type: 'express',
    email: params.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      clerk_id: params.clerkId,
    },
  });

  return account.id;
}

/**
 * @deprecated VIOLATES IN-APP-ONLY POLICY (CLAUDE.md § STRIPE INTEGRATION).
 * Returns a Stripe-hosted onboarding URL (connect.stripe.com). Per CLAUDE.md:
 * "Live leaks (do NOT add new callers — Phase B will rip these out):
 *  - lib/stripe/client.ts:createAccountLink — helper that returns a hosted URL. Audit callers + delete."
 * Use /driver/payout-setup page (renders embedded ConnectAccountOnboarding) instead.
 */
export async function createAccountLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<string> {
  if (IS_MOCK) {
    console.log('[STRIPE MOCK] Creating account link for:', params.accountId);
    return `https://stripe.mock/onboarding/${params.accountId}`;
  }

  const accountLink = await getStripe().accountLinks.create({
    account: params.accountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: 'account_onboarding',
  });

  return accountLink.url;
}

/**
 * Create Payment Intent (for ride escrow)
 * Returns real Payment Intent or mock PI based on STRIPE_MOCK flag
 */
export async function createPaymentIntent(params: {
  amount: number; // in cents
  customerId: string;
  driverId: string; // Stripe Connect account ID
  applicationFeeAmount: number; // in cents
  metadata: Record<string, string>;
}): Promise<{ id: string; clientSecret: string }> {
  if (IS_MOCK) {
    console.log('[STRIPE MOCK] Creating payment intent:', params);
    const mockId = `pi_mock_${Date.now()}`;
    return {
      id: mockId,
      clientSecret: `${mockId}_secret_mock`,
    };
  }

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: params.amount,
    currency: 'usd',
    customer: params.customerId,
    application_fee_amount: params.applicationFeeAmount,
    transfer_data: {
      destination: params.driverId,
    },
    metadata: params.metadata,
  });

  return {
    id: paymentIntent.id,
    clientSecret: paymentIntent.client_secret!,
  };
}

/**
 * Create Transfer (for payouts)
 * Returns real Transfer ID or mock ID based on STRIPE_MOCK flag
 */
export async function createTransfer(params: {
  amount: number; // in cents
  destination: string; // Stripe Connect account ID
  metadata: Record<string, string>;
}): Promise<string> {
  if (IS_MOCK) {
    console.log('[STRIPE MOCK] Creating transfer:', params);
    return `tr_mock_${Date.now()}`;
  }

  const transfer = await getStripe().transfers.create({
    amount: params.amount,
    currency: 'usd',
    destination: params.destination,
    metadata: params.metadata,
  });

  return transfer.id;
}

// Legacy export — prefer stripeClient for new callers.
export { stripeClient as stripe };
