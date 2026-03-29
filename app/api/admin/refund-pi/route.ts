import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/helpers';
import Stripe from 'stripe';

/**
 * POST — Admin refunds a PaymentIntent on a connected account.
 * Body: { paymentIntentId, stripeAccountId, reason? }
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { paymentIntentId, stripeAccountId, reason } = await req.json() as {
    paymentIntentId: string;
    stripeAccountId: string;
    reason?: string;
  };

  if (!paymentIntentId || !stripeAccountId) {
    return NextResponse.json({ error: 'paymentIntentId and stripeAccountId required' }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    // First check the PI status
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {}, {
      stripeAccount: stripeAccountId,
    });

    if (pi.status === 'requires_capture') {
      // Not yet captured — just cancel it
      const cancelled = await stripe.paymentIntents.cancel(paymentIntentId, {}, {
        stripeAccount: stripeAccountId,
      });
      return NextResponse.json({ action: 'cancelled', status: cancelled.status, amount: pi.amount / 100 });
    }

    if (pi.status === 'succeeded') {
      // Already captured — refund it
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reason: 'requested_by_customer',
      }, {
        stripeAccount: stripeAccountId,
      });
      return NextResponse.json({ action: 'refunded', refundId: refund.id, amount: refund.amount / 100, reason });
    }

    return NextResponse.json({ action: 'none', status: pi.status, message: `PI is ${pi.status} — no action needed` });
  } catch (error) {
    console.error('Refund PI error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
