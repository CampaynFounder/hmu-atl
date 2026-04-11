import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { savePaymentMethod } from '@/lib/stripe/rider-payments';

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { paymentMethodId } = await req.json();
  if (!paymentMethodId) return NextResponse.json({ error: 'paymentMethodId required' }, { status: 400 });

  const userRows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const { id: userId, profile_type: profileType } = userRows[0] as { id: string; profile_type: string };

  if (profileType === 'rider') {
    const custRows = await sql`
      SELECT stripe_customer_id FROM rider_profiles WHERE user_id = ${userId} LIMIT 1
    `;
    const customerId = (custRows[0] as Record<string, unknown>)?.stripe_customer_id as string | undefined;
    if (!customerId) return NextResponse.json({ error: 'Stripe customer not found' }, { status: 400 });
    await savePaymentMethod(userId, customerId, paymentMethodId);
  }
  // Drivers: SetupIntent already attached PM to the customer — nothing else to persist.

  return NextResponse.json({ ok: true });
}
