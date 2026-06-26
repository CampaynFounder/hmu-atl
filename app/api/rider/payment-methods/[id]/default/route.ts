import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { setDefaultPaymentMethod } from '@/lib/stripe/rider-payments';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const isMock = process.env.STRIPE_MOCK === 'true';

// PATCH /api/rider/payment-methods/[id]/default
// Switch the rider's active (charged) payment method WITHOUT deleting any card.
// The ride hold (app/api/rides/[id]/coo) and add-on captures both charge the
// method flagged is_default = true, so flipping this flag is what changes which
// card is used on the next booking. Serves both web and native.
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Verify the method belongs to this rider (404 otherwise) and grab the
    // Stripe id so we can keep the customer default in sync.
    const pmRows = await sql`
      SELECT stripe_payment_method_id FROM rider_payment_methods
      WHERE id = ${id} AND rider_id = ${userId}
      LIMIT 1
    `;
    if (!pmRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const stripePmId = (pmRows[0] as { stripe_payment_method_id: string }).stripe_payment_method_id;

    // Flip the default flag (one default per rider) — reuses the existing helper.
    await setDefaultPaymentMethod(userId, id);

    // Best-effort: keep Stripe's customer default_payment_method in sync for any
    // off-session/add-on flow that falls back to it. Never fatal — the DB flag is
    // the source of truth the ride hold reads.
    if (!isMock) {
      try {
        const profileRows = await sql`SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${userId} LIMIT 1`;
        const customerId = (profileRows[0] as Record<string, unknown>)?.stripe_customer_id as string | null;
        if (customerId) {
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: stripePmId },
          });
        }
      } catch (err: any) {
        console.error('[payment-methods/default] Stripe sync failed:', err?.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Set default payment method error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
