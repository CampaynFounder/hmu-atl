import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const isMock = process.env.STRIPE_MOCK === 'true';

export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Check DB first
    const dbMethods = await sql`
      SELECT id, stripe_payment_method_id, type, brand, last4, exp_month, exp_year, is_default
      FROM rider_payment_methods
      WHERE rider_id = ${userId}
      ORDER BY is_default DESC, created_at DESC
    `;

    if (dbMethods.length > 0) {
      return NextResponse.json({
        methods: dbMethods.map((m: Record<string, unknown>) => ({
          id: m.id,
          brand: m.brand,
          last4: m.last4,
          expMonth: m.exp_month,
          expYear: m.exp_year,
          isDefault: m.is_default,
        })),
      });
    }

    // If DB empty, sync from Stripe customer
    const profileRows = await sql`
      SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${userId} LIMIT 1
    `;
    const customerId = (profileRows[0] as Record<string, unknown>)?.stripe_customer_id as string | null;

    if (!customerId || isMock) {
      return NextResponse.json({ methods: [] });
    }

    // Fetch from Stripe and sync to DB
    const stripeMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    const methods: Array<Record<string, unknown>> = [];
    for (const pm of stripeMethods.data) {
      const isFirst: boolean = methods.length === 0;
      await sql`
        INSERT INTO rider_payment_methods (rider_id, stripe_payment_method_id, type, brand, last4, exp_month, exp_year, is_default)
        VALUES (${userId}, ${pm.id}, ${pm.type}, ${pm.card?.brand || null}, ${pm.card?.last4 || '????'}, ${pm.card?.exp_month || null}, ${pm.card?.exp_year || null}, ${isFirst})
        ON CONFLICT DO NOTHING
      `;
      methods.push({
        id: pm.id,
        brand: pm.card?.brand || null,
        last4: pm.card?.last4 || '????',
        expMonth: pm.card?.exp_month || null,
        expYear: pm.card?.exp_year || null,
        isDefault: isFirst,
      });
    }

    return NextResponse.json({ methods });
  } catch (error) {
    console.error('Get payment methods error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
