import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { savePaymentMethod } from '@/lib/stripe/rider-payments';

// Called by the mobile PaymentSheet flow after presentPaymentSheet() succeeds.
// PaymentSheet doesn't return the payment method ID — we retrieve it from the
// SetupIntent server-side using the client secret passed back from the client.
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { setupIntentClientSecret } = await req.json();
  if (!setupIntentClientSecret) {
    return NextResponse.json({ error: 'setupIntentClientSecret required' }, { status: 400 });
  }

  // Extract SetupIntent ID from client secret: "seti_xxx_secret_yyy" → "seti_xxx"
  const setupIntentId = setupIntentClientSecret.split('_secret_')[0];
  if (!setupIntentId?.startsWith('seti_')) {
    return NextResponse.json({ error: 'Invalid client secret format' }, { status: 400 });
  }

  const si = await stripe.setupIntents.retrieve(setupIntentId);
  if (si.status !== 'succeeded') {
    return NextResponse.json({ error: `SetupIntent not succeeded: ${si.status}` }, { status: 400 });
  }

  const paymentMethodId = typeof si.payment_method === 'string'
    ? si.payment_method
    : si.payment_method?.id;
  if (!paymentMethodId) {
    return NextResponse.json({ error: 'No payment method on SetupIntent' }, { status: 400 });
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  const custRows = await sql`SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`;
  const customerId = (custRows[0] as Record<string, unknown>)?.stripe_customer_id as string;
  if (!customerId) return NextResponse.json({ error: 'Stripe customer not found' }, { status: 400 });

  await savePaymentMethod(userId, customerId, paymentMethodId);
  return NextResponse.json({ success: true });
}
