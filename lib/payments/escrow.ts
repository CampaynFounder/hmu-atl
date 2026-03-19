import { stripe } from '@/lib/stripe/connect';

const isMock = process.env.STRIPE_MOCK === 'true';

// Backwards-compat stubs for routes still referencing old API
export function calculateFare(..._args: unknown[]) { return { amount: 0, total: 0, baseFare: 0, distanceFee: 0, durationFee: 0, timeFee: 0, currency: 'usd' }; }
export function createEscrow(..._args: unknown[]) { return Promise.resolve('mock_escrow'); }
export function validateEscrowParams(..._args: unknown[]) { return true; }

export async function holdRiderPayment(params: {
  rideId: string;
  amountInCents: number;
  stripeCustomerId: string;
  paymentMethodId: string;
  driverStripeAccountId: string;
}): Promise<string> {
  if (isMock) return 'pi_mock_' + Date.now();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amountInCents,
    currency: 'usd',
    customer: params.stripeCustomerId,
    payment_method: params.paymentMethodId,
    capture_method: 'manual',
    confirm: true,
    transfer_data: { destination: params.driverStripeAccountId },
    statement_descriptor: 'HMU ATL RIDE',
    metadata: { rideId: params.rideId },
  });

  return paymentIntent.id;
}

export async function captureRiderPayment(
  paymentIntentId: string,
  platformFeeInCents: number
): Promise<void> {
  if (isMock) return;

  await stripe.paymentIntents.capture(paymentIntentId, {
    application_fee_amount: platformFeeInCents,
  });
}

export async function refundRiderPayment(paymentIntentId: string): Promise<void> {
  if (isMock) return;

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status === 'requires_capture') {
    await stripe.paymentIntents.cancel(paymentIntentId);
  } else if (pi.status === 'succeeded') {
    await stripe.refunds.create({ payment_intent: paymentIntentId });
  }
}
