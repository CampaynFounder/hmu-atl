import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const isMock = process.env.STRIPE_MOCK === 'true';

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { method } = body as { method: 'standard' | 'instant' };

    const rows = await sql`
      SELECT dp.stripe_account_id, dp.stripe_instant_eligible, u.tier, u.id as user_id
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const driver = rows[0] as {
      stripe_account_id: string | null;
      stripe_instant_eligible: boolean;
      tier: string;
      user_id: string;
    };

    if (!driver.stripe_account_id) {
      return NextResponse.json({ error: 'Payout account not set up' }, { status: 400 });
    }

    if (isMock) {
      return NextResponse.json({
        success: true,
        payoutId: 'po_mock_' + Date.now(),
        amount: 0,
        method,
        fee: 0,
        arrival: method === 'instant' ? 'Minutes' : '1-2 business days',
      });
    }

    // Get full balance — check available, pending, AND instant_available
    const balance = await stripe.balance.retrieve({
      stripeAccount: driver.stripe_account_id,
    });

    const availableCents = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const instantAvailableCents = balance.instant_available?.reduce((sum, b) => sum + b.amount, 0) ?? 0;

    if (method === 'instant') {
      // For instant payouts, use instant_available (includes pending funds Stripe will front)
      const payableCents = Math.max(availableCents, instantAvailableCents);

      if (payableCents <= 0) {
        return NextResponse.json({ error: 'No balance to cash out' }, { status: 400 });
      }

      let fee = 0;
      // HMU First gets free instant payouts
      if (driver.tier !== 'hmu_first') {
        const percentFee = Math.round(payableCents * 0.01);
        fee = Math.max(100, percentFee); // $1.00 or 1% whichever is higher
      }

      const payoutAmountCents = payableCents - fee;
      if (payoutAmountCents <= 0) {
        return NextResponse.json({ error: 'Balance too low for instant payout after fee' }, { status: 400 });
      }

      const payout = await stripe.payouts.create(
        {
          amount: payoutAmountCents,
          currency: 'usd',
          method: 'instant',
          metadata: { driverId: driver.user_id, fee: String(fee) },
        },
        { stripeAccount: driver.stripe_account_id }
      );

      return NextResponse.json({
        success: true,
        payoutId: payout.id,
        amount: payoutAmountCents / 100,
        grossAmount: payableCents / 100,
        fee: fee / 100,
        method: 'instant',
        arrival: 'Minutes',
        tier: driver.tier,
      });
    } else {
      // Standard payout — uses available balance only
      if (availableCents <= 0) {
        return NextResponse.json({
          error: 'No available balance for standard payout. Try instant payout to access pending funds.',
        }, { status: 400 });
      }

      const payout = await stripe.payouts.create(
        {
          amount: availableCents,
          currency: 'usd',
          method: 'standard',
          metadata: { driverId: driver.user_id },
        },
        { stripeAccount: driver.stripe_account_id }
      );

      return NextResponse.json({
        success: true,
        payoutId: payout.id,
        amount: availableCents / 100,
        fee: 0,
        method: 'standard',
        arrival: '1-2 business days',
        tier: driver.tier,
      });
    }
  } catch (error) {
    console.error('Cashout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cashout failed' },
      { status: 500 }
    );
  }
}
