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

    const rows = await sql`
      SELECT dp.stripe_account_id, dp.stripe_instant_eligible, u.tier
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const driver = rows[0] as {
      stripe_account_id: string | null;
      stripe_instant_eligible: boolean;
      tier: string;
    };

    if (!driver.stripe_account_id) {
      return NextResponse.json({ available: 0, pending: 0, instantEligible: false, tier: driver.tier });
    }

    if (isMock) {
      return NextResponse.json({
        available: 0,
        pending: 0,
        instantEligible: false,
        tier: driver.tier,
        currency: 'usd',
      });
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: driver.stripe_account_id,
    });

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;
    const instantAvailable = balance.instant_available?.reduce((sum, b) => sum + b.amount, 0) ?? 0;

    // Determine payout readiness
    let payoutStatus: string;
    if (available <= 0 && pending <= 0 && instantAvailable <= 0) {
      payoutStatus = 'no_balance';
    } else if (available > 0) {
      payoutStatus = 'ready';
    } else if (instantAvailable > 0) {
      payoutStatus = 'instant_only';
    } else {
      payoutStatus = 'pending_hold';
    }

    return NextResponse.json({
      available,
      pending,
      instantAvailable: instantAvailable / 100,
      instantEligible: driver.stripe_instant_eligible || instantAvailable > 0,
      tier: driver.tier,
      currency: 'usd',
      payoutStatus,
    });
  } catch (error) {
    console.error('Balance error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get balance' },
      { status: 500 }
    );
  }
}
