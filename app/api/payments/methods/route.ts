import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Stripe from 'stripe';
import { sql } from '@/lib/db/client';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' });
}

// GET — list saved payment methods
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await sql`
    SELECT stripe_customer_id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) return NextResponse.json({ success: true, paymentMethods: [] });

  const stripe = getStripe();
  const methods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });

  return NextResponse.json({
    success: true,
    paymentMethods: methods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'card',
      last4: pm.card?.last4 ?? '????',
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    })),
  });
}

// POST — attach a new payment method and create/update Stripe customer
export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { paymentMethodId } = await request.json();
  if (!paymentMethodId) {
    return NextResponse.json({ error: 'paymentMethodId required' }, { status: 400 });
  }

  // Get or create Stripe customer
  const rows = await sql`
    SELECT id, stripe_customer_id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const user = rows[0] as { id: string; stripe_customer_id: string | null };
  let customerId = user.stripe_customer_id;

  const stripe = getStripe();

  if (!customerId) {
    const customer = await stripe.customers.create({
      payment_method: paymentMethodId,
      metadata: { clerkId, userId: user.id },
    });
    customerId = customer.id;

    await sql`
      UPDATE users SET stripe_customer_id = ${customerId}, updated_at = NOW()
      WHERE id = ${user.id}
    `;
  } else {
    // Attach to existing customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
  }

  // Set as default payment method
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  return NextResponse.json({ success: true, customerId });
}
