import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { resolvePricingStrategy } from '@/lib/payments/strategies';
import { getChartPalette } from '@/lib/earnings/chart-palette';
import { isDemoPhone } from '@/lib/demo/phones';
import { getDemoDriverFinancials, buildDemoBalance } from '@/lib/demo/data';
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
      SELECT u.id as user_id, u.phone, dp.stripe_account_id, dp.stripe_instant_eligible, u.tier
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.clerk_id = ${clerkId} LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const driver = rows[0] as {
      user_id: string;
      phone: string | null;
      stripe_account_id: string | null;
      stripe_instant_eligible: boolean;
      tier: string;
    };
    const driverUserId = driver.user_id;

    // Active pricing mode drives the driver-facing wallet language: in
    // deposit_only the digital balance is the deposit + extras and the driver
    // still collects the cash remainder per ride; in full-fare modes the whole
    // fare is already collected. Resolver is 60s-cached and never throws.
    const activeMode = (await resolvePricingStrategy(driver.user_id)).modeKey;

    // Demo reviewer account: return admin-entered numbers instead of real
    // Stripe/DB data (the reviewer account has neither). Keeps the real,
    // admin-tunable palette + flag so the chart still behaves normally.
    if (isDemoPhone(driver.phone)) {
      const demo = await getDemoDriverFinancials();
      if (demo.enabled) {
        const [chartPalette, depositsDetailSheet] = await Promise.all([
          getChartPalette(),
          isFeatureEnabled('driver_deposits_detail_sheet', { userId: driverUserId }),
        ]);
        return NextResponse.json(buildDemoBalance(demo, { chartPalette, activeMode, depositsDetailSheet }));
      }
    }

    // ── DB earnings (Stripe-INDEPENDENT) ──────────────────────────────────────
    // Computed BEFORE any Stripe call, and returned in EVERY path, so the wallet
    // tiles always render. A driver who has earned but not yet connected/been
    // approved for Stripe (the platform explicitly lets drivers earn pre-payout),
    // mock mode, OR any transient Stripe outage must never zero out the
    // CASH / HMU PAY / NO-SHOW / DELIVERY figures. Stripe powers ONLY the
    // withdrawable `available` balance further down.
    //
    // Regression guard: this block must stay ABOVE the Stripe section. Earnings
    // are a property of completed rides in our own DB, not of Stripe balance —
    // moving Stripe in front of them is what made every container read $0 for
    // drivers without a funded/approved Stripe account.

    // Cash and Deposits exclude no-show rides so the three buckets don't
    // double-count. No-shows get their own bucket below.
    const cashRows = await sql`
      SELECT
        COUNT(*) as cash_rides,
        COALESCE(SUM(COALESCE(final_agreed_price, amount, 0) + COALESCE(add_on_total, 0)), 0) as cash_total
      FROM rides
      WHERE driver_id = ${driverUserId}
        AND is_cash = true
        AND status IN ('active', 'in_progress', 'ended', 'completed')
        AND (no_show_percent IS NULL OR no_show_percent = 0)
    `;
    const legacyCashRides = Number((cashRows[0] as Record<string, unknown>).cash_rides || 0);
    const legacyCashTotal = Number((cashRows[0] as Record<string, unknown>).cash_total || 0);

    // Deposit-only Pull Up Cash: the rider hands the driver the fare minus the
    // digital deposit, in person. is_cash is FALSE on these rides (they carry a
    // digital deposit), so the legacy cash query above misses them entirely —
    // which is why deposit-mode drivers saw $0 cash. Count it here and fold it
    // into the cash figure so the wallet reflects real cash in hand. (Extras
    // are charged digitally, so they do NOT add to the cash remainder.)
    const depositCashRows = await sql`
      SELECT
        COUNT(*) as rides,
        COALESCE(SUM(GREATEST(COALESCE(final_agreed_price, amount, 0) - COALESCE(visible_deposit, 0), 0)), 0) as cash_total
      FROM rides
      WHERE driver_id = ${driverUserId}
        AND pricing_mode_key = 'deposit_only'
        AND (is_cash IS NULL OR is_cash = false)
        AND status IN ('active', 'in_progress', 'ended', 'completed')
        AND (no_show_percent IS NULL OR no_show_percent = 0)
    `;
    const depositCashRides = Number((depositCashRows[0] as Record<string, unknown>).rides || 0);
    const depositCashTotal = Number((depositCashRows[0] as Record<string, unknown>).cash_total || 0);

    const cashRides = legacyCashRides + depositCashRides;
    const cashTotal = Math.round((legacyCashTotal + depositCashTotal) * 100) / 100;

    const digitalRows = await sql`
      SELECT
        COUNT(*) as digital_rides,
        COALESCE(SUM(driver_payout_amount), 0) as digital_total
      FROM rides
      WHERE driver_id = ${driverUserId}
        AND (is_cash IS NULL OR is_cash = false)
        AND (payment_captured = true OR status IN ('ended', 'completed'))
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
        AND (payment_captured = true OR status IN ('ended', 'completed'))
        AND no_show_percent > 0
    `;
    const noShowRides = Number((noShowRows[0] as Record<string, unknown>).no_show_rides || 0);
    const noShowTotal = Number((noShowRows[0] as Record<string, unknown>).no_show_total || 0);

    // Delivery (store-run) earnings — net courier fee (delivery fee minus the
    // platform cut), completed + captured jobs only. This feeds the earnings
    // breakdown / chart ONLY; delivery payouts are not yet in the Stripe
    // balance, so they are deliberately kept out of `available`/cashout to
    // avoid surfacing a phantom withdrawable balance.
    const deliveryRows = await sql`
      SELECT
        COUNT(*) as delivery_jobs,
        COALESCE(SUM(GREATEST(delivery_fee_cents - platform_fee_cents, 0)), 0) / 100.0 as delivery_total
      FROM delivery_requests
      WHERE courier_id = ${driverUserId}
        AND status = 'completed'
        AND payment_captured = true
    `;
    const deliveryJobs = Number((deliveryRows[0] as Record<string, unknown>).delivery_jobs || 0);
    const deliveryTotal = Number((deliveryRows[0] as Record<string, unknown>).delivery_total || 0);

    // Per-driver feature flag for the Deposits Detail Sheet overlay. Dormant
    // when the flag row is missing — keeps the tile static (pre-launch
    // behavior). The client gates tappability on this value.
    const depositsDetailSheet = await isFeatureEnabled(
      'driver_deposits_detail_sheet',
      { userId: driverUserId },
    );

    // Superadmin-tunable chart palette (cached). Sent on the balance response so
    // the mobile chart recolors live on next refresh — no app rebuild.
    const chartPalette = await getChartPalette();

    const earnings = {
      cashEarnings: { rides: cashRides, total: cashTotal },
      digitalEarnings: { rides: digitalRides, total: digitalTotal },
      noShowEarnings: { rides: noShowRides, total: noShowTotal },
      deliveryEarnings: { jobs: deliveryJobs, total: deliveryTotal },
      chartPalette,
      flags: { depositsDetailSheet },
    };

    // ── Stripe balance (BEST-EFFORT) ──────────────────────────────────────────
    // Powers ONLY the withdrawable balance + payout state. No connected account,
    // mock mode, or a Stripe error leaves these zeroed but never blocks the
    // earnings above. Wrapped in try/catch so a Stripe outage degrades the
    // cash-out CTA instead of nuking the whole wallet.
    let available = 0;
    let pending = 0;
    let instantAvailableCents = 0;
    let fundsAvailableOn: string | null = null;
    let platformInstantEnabled = false;
    let payoutStatus = 'no_balance';

    if (driver.stripe_account_id && !isMock) {
      try {
        // Fetch Stripe balance + pending balance transactions in parallel — the
        // second call powers the "$X lands on Apr 22" date the UI surfaces.
        const [balance, txns] = await Promise.all([
          stripe.balance.retrieve({ stripeAccount: driver.stripe_account_id }),
          stripe.balanceTransactions.list(
            { limit: 10 },
            { stripeAccount: driver.stripe_account_id }
          ),
        ]);

        available = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
        pending = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;
        instantAvailableCents = balance.instant_available?.reduce((sum, b) => sum + b.amount, 0) ?? 0;

        // Earliest available_on across pending balance transactions = when
        // Stripe will release the first chunk of pending funds into standard
        // available. Null when nothing is pending.
        const pendingUnlocks = txns.data
          .filter(t => t.status === 'pending')
          .map(t => t.available_on)
          .sort((a, b) => a - b);
        fundsAvailableOn = pendingUnlocks[0]
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
        platformInstantEnabled =
          (configRows[0] as { config_value?: { enabled?: boolean } } | undefined)
            ?.config_value?.enabled === true;

        // Determine payout readiness
        if (available <= 0 && pending <= 0 && instantAvailableCents <= 0) {
          payoutStatus = 'no_balance';
        } else if (available > 0) {
          payoutStatus = 'ready';
        } else if (instantAvailableCents > 0) {
          payoutStatus = 'instant_only';
        } else {
          payoutStatus = 'pending_hold';
        }
      } catch (stripeErr) {
        // Non-fatal: keep the zeroed balance, still return DB earnings below.
        console.error('Balance: Stripe fetch failed (non-fatal):', stripeErr);
      }
    }

    return NextResponse.json({
      available,
      pending,
      instantAvailable: instantAvailableCents / 100,
      instantEligible: driver.stripe_instant_eligible || instantAvailableCents > 0,
      platformInstantEnabled,
      fundsAvailableOn,
      tier: driver.tier,
      currency: 'usd',
      activeMode,
      payoutStatus,
      ...earnings,
    });
  } catch (error) {
    console.error('Balance error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get balance' },
      { status: 500 }
    );
  }
}
