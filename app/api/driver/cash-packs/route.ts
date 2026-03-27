import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  httpClient: Stripe.createFetchHttpClient(),
});
const isMock = process.env.STRIPE_MOCK === 'true';

const CASH_PACKS: Record<string, { rides: number; label: string }> = {
  '10': { rides: 10, label: 'Cash Pack 10' },
  '25': { rides: 25, label: 'Cash Pack 25' },
};

// Price IDs from Stripe — replace with real ones
const PRICE_IDS: Record<string, string> = {
  '10': process.env.CASH_PACK_10_PRICE_ID || 'price_placeholder_10',
  '25': process.env.CASH_PACK_25_PRICE_ID || 'price_placeholder_25',
};

/**
 * GET — get driver's cash ride balance
 */
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await sql`
      SELECT dp.cash_rides_remaining, dp.cash_pack_balance, dp.cash_rides_reset_at, u.tier
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const d = rows[0] as {
      cash_rides_remaining: number;
      cash_pack_balance: number;
      cash_rides_reset_at: string;
      tier: string;
    };

    const isHmuFirst = d.tier === 'hmu_first';

    return NextResponse.json({
      freeRemaining: d.cash_rides_remaining,
      packBalance: d.cash_pack_balance,
      total: isHmuFirst ? -1 : d.cash_rides_remaining + d.cash_pack_balance, // -1 = unlimited
      unlimited: isHmuFirst,
      resetsAt: d.cash_rides_reset_at,
    });
  } catch (error) {
    console.error('Cash packs GET error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/**
 * POST — purchase a cash pack (creates SetupIntent for inline payment, then charges)
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pack, paymentMethodId } = await req.json();

    if (!pack || !CASH_PACKS[pack]) {
      return NextResponse.json({ error: 'Invalid pack. Choose "10" or "25".' }, { status: 400 });
    }

    const rows = await sql`
      SELECT dp.stripe_customer_id, dp.user_id, u.tier
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const driver = rows[0] as { stripe_customer_id: string | null; user_id: string; tier: string };

    if (driver.tier === 'hmu_first') {
      return NextResponse.json({ error: 'HMU First drivers have unlimited cash rides' }, { status: 400 });
    }

    const packInfo = CASH_PACKS[pack];
    const priceId = PRICE_IDS[pack];

    if (isMock) {
      await sql`
        UPDATE driver_profiles
        SET cash_pack_balance = COALESCE(cash_pack_balance, 0) + ${packInfo.rides}
        WHERE user_id = ${driver.user_id}
      `;
      return NextResponse.json({ success: true, added: packInfo.rides });
    }

    // Create Stripe customer if needed
    if (!driver.stripe_customer_id) {
      const customer = await stripe.customers.create({
        metadata: { userId: driver.user_id as string },
      });
      await sql`
        UPDATE driver_profiles SET stripe_customer_id = ${customer.id}
        WHERE user_id = ${driver.user_id}
      `;
      driver.stripe_customer_id = customer.id;
    }

    // If paymentMethodId provided, charge directly and save the card
    if (paymentMethodId) {
      // Attach payment method to customer for future use
      try {
        await stripe.paymentMethods.attach(paymentMethodId, { customer: driver.stripe_customer_id });
        await stripe.customers.update(driver.stripe_customer_id, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      } catch {
        // May already be attached — non-fatal
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: pack === '10' ? 499 : 999, // $4.99 or $9.99
        currency: 'usd',
        customer: driver.stripe_customer_id,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        setup_future_usage: 'off_session',
        metadata: { userId: driver.user_id, pack, rides: String(packInfo.rides) },
      });

      if (paymentIntent.status === 'succeeded') {
        await sql`
          UPDATE driver_profiles
          SET cash_pack_balance = COALESCE(cash_pack_balance, 0) + ${packInfo.rides}
          WHERE user_id = ${driver.user_id}
        `;
        return NextResponse.json({ success: true, added: packInfo.rides });
      }

      return NextResponse.json({ error: 'Payment failed', status: paymentIntent.status }, { status: 402 });
    }

    // No payment method — create a SetupIntent for inline collection
    const setupIntent = await stripe.setupIntents.create({
      customer: driver.stripe_customer_id,
      automatic_payment_methods: { enabled: true },
      usage: 'off_session',
      metadata: { userId: driver.user_id, purpose: 'cash_pack', pack },
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret, pack });
  } catch (error) {
    console.error('Cash pack purchase error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
