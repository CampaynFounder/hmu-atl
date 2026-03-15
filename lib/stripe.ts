/**
 * Stripe Connect wrapper.
 * When STRIPE_MOCK=true (default) all calls are simulated locally.
 * Wire real Stripe by setting STRIPE_MOCK=false and STRIPE_SECRET_KEY.
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
    destination: typeof transfer.destination === 'string'
      ? transfer.destination
      : (transfer.destination as { id: string }).id,
    created: transfer.created as number,
  };
}
