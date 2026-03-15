/**
 * Stripe Connect wrapper.
 * STRIPE_MOCK=true (default) simulates all calls locally.
 * Set STRIPE_MOCK=false and provide STRIPE_SECRET_KEY to enable real transfers.
 */

export interface StripeTransferResult {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  created: number;
}

const isMock = process.env.STRIPE_MOCK !== 'false';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRealStripe(): Promise<any> {
  // require() so the build never breaks even without the stripe package.
  // Install stripe npm package and set STRIPE_MOCK=false to activate.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-01-27.acacia',
  });
}

export async function createTransfer(params: {
  amount_cents: number;
  currency: string;
  destination: string;
  description?: string;
  metadata?: Record<string, string>;
}): Promise<StripeTransferResult> {
  if (isMock) {
    return {
      id: `tr_mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      amount: params.amount_cents,
      currency: params.currency,
      destination: params.destination,
      created: Math.floor(Date.now() / 1000),
    };
  }

  const stripe = await getRealStripe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transfer: any = await stripe.transfers.create({
    amount: params.amount_cents,
    currency: params.currency,
    destination: params.destination,
    description: params.description,
    metadata: params.metadata ?? {},
  });

  return {
    id: transfer.id as string,
    amount: transfer.amount as number,
    currency: transfer.currency as string,
    destination:
      typeof transfer.destination === 'string'
        ? transfer.destination
        : (transfer.destination as { id: string }).id,
    created: transfer.created as number,
  };
}
