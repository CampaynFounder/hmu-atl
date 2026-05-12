import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
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

    // Fetch Stripe balance + pending balance transactions in parallel — the
    // second call powers the "$X lands on Apr 22" date the UI surfaces.
    const [balance, txns] = await Promise.all([
      stripe.balance.retrieve({ stripeAccount: driver.stripe_account_id }),
      stripe.balanceTransactions.list(
        { limit: 10 },
        { stripeAccount: driver.stripe_account_id }
      ),
    ]);

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;
    const instantAvailable = balance.instant_available?.reduce((sum, b) => sum + b.amount, 0) ?? 0;

    // Earliest available_on across pending balance transactions = when
    // Stripe will release the first chunk of pending funds into standard
    // available. Null when nothing is pending.
    const pendingUnlocks = txns.data
      .filter(t => t.status === 'pending')
      .map(t => t.available_on)
      .sort((a, b) => a - b);
    const fundsAvailableOn = pendingUnlocks[0]
      ? new Date(pendingUnlocks[0] * 1000).toISOString()
      : null;

    // Platform-level Instant Payouts toggle. Stripe starts new Connect
    // platforms with a $0.00/day Instant volume cap until they manually
    // approve an increase — the flag lets the UI show "Instant unlocks
    // with trust" messaging instead of letting the driver hit a scary
    // Stripe rejection. Read defensively so a missing row doesn't 500.
    const configRows = await sql`
      SELECT config_value FROM platform_config
      WHERE config_key = 'instant_payouts_enabled' LIMIT 1
    `;
    const platformInstantEnabled =
      (configRows[0] as { config_value?: { enabled?: boolean } } | undefined)
        ?.config_value?.enabled === true;

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

    // Query cash ride earnings from DB (not in Stripe)
    const userIdRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    const driverUserId = (userIdRows[0] as { id: string }).id;

    // Cash and Deposits exclude no-show rides so the three buckets don't
    // double-count. No-shows get their own bucket below.
    const cashRows = await sql`
      SELECT
        COUNT(*) as cash_rides,
        COALESCE(SUM(COALESCE(final_agreed_price, amount, 0) + COALESCE(add_on_total, 0)), 0) as cash_total
      FROM rides
      WHERE driver_id = ${driverUserId}
        AND is_cash = true
        AND status IN ('ended', 'completed')
        AND (no_show_percent IS NULL OR no_show_percent = 0)
    `;
    const cashRides = Number((cashRows[0] as Record<string, unknown>).cash_rides || 0);
    const cashTotal = Number((cashRows[0] as Record<string, unknown>).cash_total || 0);

    const digitalRows = await sql`
      SELECT
        COUNT(*) as digital_rides,
        COALESCE(SUM(driver_payout_amount), 0) as digital_total
      FROM rides
      WHERE driver_id = ${driverUserId}
        AND (is_cash IS NULL OR is_cash = false)
        AND status IN ('ended', 'completed')
        AND (no_show_percent IS NULL OR no_show_percent = 0)
    `;
    const digitalRides = Number((digitalRows[0] as Record<string, unknown>).digital_rides || 0);
    const digitalTotal = Number((digitalRows[0] as Record<string, unknown>).digital_total || 0);

    const noShowRows = await sql`
      SELECT
        COUNT(*) as no_show_rides,
        COALESCE(SUM(driver_payout_amount), 0) as no_show_total
      FROM rides
      WHERE driver_id = ${driverUserId}
        AND status IN ('ended', 'completed')
        AND no_show_percent > 0
    `;
    const noShowRides = Number((noShowRows[0] as Record<string, unknown>).no_show_rides || 0);
    const noShowTotal = Number((noShowRows[0] as Record<string, unknown>).no_show_total || 0);

    // Per-driver feature flag for the Deposits Detail Sheet overlay. Dormant
    // when the flag row is missing — keeps the tile static (pre-launch
    // behavior). The client gates tappability on this value.
    const depositsDetailSheet = await isFeatureEnabled(
      'driver_deposits_detail_sheet',
      { userId: driverUserId },
    );

    return NextResponse.json({
      available,
      pending,
      instantAvailable: instantAvailable / 100,
      instantEligible: driver.stripe_instant_eligible || instantAvailable > 0,
      platformInstantEnabled,
      fundsAvailableOn,
      tier: driver.tier,
      currency: 'usd',
      payoutStatus,
      cashEarnings: { rides: cashRides, total: cashTotal },
      digitalEarnings: { rides: digitalRides, total: digitalTotal },
      noShowEarnings: { rides: noShowRides, total: noShowTotal },
      flags: { depositsDetailSheet },
    });
  } catch (error) {
    console.error('Balance error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get balance' },
      { status: 500 }
    );
  }
}
