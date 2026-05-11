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
    const { method, amount: requestedAmount } = body as { method: 'standard' | 'instant'; amount?: number };

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
      // Use available (settled) — instantAvailable may include unsettled/fronted amounts
      const maxPayableCents = availableCents > 0 ? availableCents : instantAvailableCents;

      if (maxPayableCents <= 0) {
        return NextResponse.json({ error: 'No balance to cash out' }, { status: 400 });
      }

      // Use requested amount or max
      const requestedCents = requestedAmount
        ? Math.round(requestedAmount * 100)
        : maxPayableCents;

      const payableCents = Math.min(requestedCents, maxPayableCents);

      if (payableCents <= 0) {
        return NextResponse.json({ error: 'Amount too low' }, { status: 400 });
      }

      let fee = 0;
      if (driver.tier !== 'hmu_first') {
        const percentFee = Math.round(payableCents * 0.01);
        fee = Math.max(100, percentFee);
      }

      const payoutAmountCents = payableCents - fee;
      if (payoutAmountCents <= 0) {
        return NextResponse.json({ error: 'Balance too low for instant payout after fee' }, { status: 400 });
      }

      // Single operation ID drives the idempotency keys for both Stripe calls
      // below. Same string → Stripe replays the prior response, so a network
      // retry can't double-transfer the fee or double-payout the driver.
      const opId = crypto.randomUUID();

      // STEP 1 — Move the instant-payout fee from the driver's Connect balance
      // to the platform BEFORE the payout fires. Doing this first means:
      //   - If the transfer fails, no payout happens. Driver can retry cleanly.
      //   - If both succeed, driver's Connect balance ends at zero, not at $fee.
      //     Previously the fee just sat in Connect, looking cashable to the driver
      //     while never accruing to the platform.
      // Skipped when fee === 0 (HMU First tier, free instant).
      if (fee > 0) {
        const platformAccountId = process.env.STRIPE_PLATFORM_ACCOUNT_ID;
        if (!platformAccountId) {
          return NextResponse.json(
            { error: 'Platform account not configured', detail: 'STRIPE_PLATFORM_ACCOUNT_ID missing' },
            { status: 500 }
          );
        }
        await stripe.transfers.create(
          {
            amount: fee,
            currency: 'usd',
            destination: platformAccountId,
            description: `Instant payout fee — driver ${driver.user_id}`,
            metadata: {
              kind: 'instant_payout_fee',
              driver_id: driver.user_id,
              op_id: opId,
            },
          },
          {
            stripeAccount: driver.stripe_account_id,
            idempotencyKey: `cashout_fee_${opId}`,
          }
        );
      }

      const payout = await stripe.payouts.create(
        {
          amount: payoutAmountCents,
          currency: 'usd',
          method: 'instant',
          metadata: { driverId: driver.user_id, fee: String(fee), opId },
        },
        {
          stripeAccount: driver.stripe_account_id,
          idempotencyKey: `cashout_payout_${opId}`,
        }
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
      // Standard payout — use settled available funds
      const standardMax = availableCents;
      if (standardMax <= 0) {
        return NextResponse.json({
          error: 'No balance to cash out.',
        }, { status: 400 });
      }

      const standardCents = requestedAmount
        ? Math.min(Math.round(requestedAmount * 100), standardMax)
        : standardMax;

      try {
        const payout = await stripe.payouts.create(
          {
            amount: standardCents,
            currency: 'usd',
            method: 'standard',
            metadata: { driverId: driver.user_id },
          },
          { stripeAccount: driver.stripe_account_id }
        );

        return NextResponse.json({
          success: true,
          payoutId: payout.id,
          amount: standardCents / 100,
          fee: 0,
          method: 'standard',
          arrival: '1-2 business days',
          tier: driver.tier,
        });
      } catch (payoutError) {
        const msg = payoutError instanceof Error ? payoutError.message : 'Payout failed';

        // If standard payout also fails, funds are likely still in Stripe's hold period
        if (msg.includes('insufficient') || msg.includes('balance')) {
          return NextResponse.json({
            error: 'Your funds are still being processed by Stripe.',
            errorType: 'pending_hold',
            detail: 'New accounts have a short hold period (usually 1-2 days). Your $' +
              (standardMax / 100).toFixed(2) + ' will be available for payout soon. Check back tomorrow.',
          }, { status: 400 });
        }

        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }
  } catch (error) {
    console.error('Cashout error:', error);
    const msg = error instanceof Error ? error.message : 'Cashout failed';

    // Detect Stripe instant payout volume limit
    if (msg.includes('daily volume limit') || msg.includes('Instant Payouts')) {
      return NextResponse.json({
        error: 'Instant Payouts unlock with trust',
        errorType: 'instant_limit',
        detail: 'New accounts ride Standard first while we verify identity — it\'s how we keep HMU safe for everyone. Your money is 100% guaranteed and will arrive via Standard. We\'ll text you the second it\'s ready. Instant Payouts unlock as you complete more rides.',
      }, { status: 400 });
    }

    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
