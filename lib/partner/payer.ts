// Partner payer resolution — shared Stripe-customer helpers for both payer modes.
//
// vendor_funded: the delivery fee is charged to the partner's own Stripe
//   customer (one card on file for the whole partner).
// pass_through:  each guest rider gets their own Stripe customer; the vendor
//   collects a card into it via a SetupIntent (see /payment-setup), and the fee
//   is charged to that rider's customer.
//
// All helpers are mock-aware (STRIPE_MOCK) so the flow is testable end to end.

import { stripe } from '@/lib/stripe/connect';

function isMock(): boolean {
  return process.env.STRIPE_MOCK === 'true';
}

/** The default (or first) card payment method on a customer, or null if none. */
export async function customerDefaultPaymentMethod(customerId: string): Promise<string | null> {
  if (isMock()) return `pm_mock_${customerId}`.slice(0, 60);
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) return null;
  const def = customer.invoice_settings?.default_payment_method;
  if (def) return typeof def === 'string' ? def : def.id;
  const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
  return list.data[0]?.id ?? null;
}

/** Create a Stripe customer for a partner's guest rider (pass_through). */
export async function createGuestStripeCustomer(opts: {
  partnerId: string;
  externalRef: string;
  name?: string | null;
}): Promise<string> {
  if (isMock()) return `cus_mock_${opts.partnerId.slice(0, 8)}_${opts.externalRef}`.slice(0, 60);
  const c = await stripe.customers.create({
    name: opts.name ?? undefined,
    metadata: { partnerId: opts.partnerId, externalRef: opts.externalRef, kind: 'partner_guest' },
  });
  return c.id;
}

/** SetupIntent client_secret so the vendor can attach a card to the guest customer. */
export async function createGuestSetupIntent(customerId: string): Promise<string> {
  if (isMock()) return `seti_mock_secret_${customerId}`.slice(0, 60);
  const si = await stripe.setupIntents.create({
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    usage: 'off_session',
  });
  return si.client_secret!;
}
