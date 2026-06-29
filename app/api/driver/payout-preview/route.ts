// GET /api/driver/payout-preview?fare=15[&deposit=7.5][&extras=0]
//
// Canonical "how I get paid" math for the deposit-only mode, computed server-side
// from the LIVE config (payments:global.depositOnly) so the driver calculator can
// never drift from what's actually captured. Reuses the exact strategy helpers
// (clampDeposit / fee / Stripe estimate) and honors the configurable Stripe-fee
// bearer. Replaces the stale client-side formula in payment-preview.tsx.
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getDepositOnlyConfig,
  clampDeposit,
  calculateDepositFeeCents,
  calculateExtrasFeeCents,
  estimateStripeFeeCents,
} from '@/lib/payments/strategies/deposit-only';

export const runtime = 'nodejs';

const round2 = (cents: number) => Math.round(cents) / 100;

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fare = Number(req.nextUrl.searchParams.get('fare'));
  if (!Number.isFinite(fare) || fare <= 0) {
    return NextResponse.json({ error: 'fare must be a positive number' }, { status: 400 });
  }
  const extras = Math.max(0, Number(req.nextUrl.searchParams.get('extras')) || 0);
  const config = await getDepositOnlyConfig();

  // Deposit: use the rider-requested value if provided, else illustrate at the
  // max (the cap). Always run it through the same clamp as a real booking.
  const requestedParam = req.nextUrl.searchParams.get('deposit');
  const requested = requestedParam != null && Number.isFinite(Number(requestedParam))
    ? Number(requestedParam)
    : fare * config.depositMaxPctOfFare;
  const deposit = clampDeposit(requested, fare, config);
  const depositCents = Math.round(deposit * 100);

  const driverBears = config.stripeFeeBearer === 'driver';

  // Deposit economics (mirror DepositOnlyStrategy.calculateCapture).
  const baseFeeCents = calculateDepositFeeCents(depositCents, config);
  const stripeFeeCents = estimateStripeFeeCents(depositCents);
  const appFeeCents = baseFeeCents + (driverBears ? stripeFeeCents : 0);
  const driverViaStripeCents = depositCents - appFeeCents;
  const hmuFeeNetCents = appFeeCents - stripeFeeCents; // HMU's true net (what the breakdown labels "HMU Fee")
  const cashAtPickupCents = Math.round((fare - deposit) * 100);

  // Extras: each is its own Stripe destination charge at the configurable rate.
  const extrasCents = Math.round(extras * 100);
  const extrasFeeCents = calculateExtrasFeeCents(extrasCents, config);
  const extrasStripeCents = estimateStripeFeeCents(extrasCents);
  const extrasAppFeeCents = extrasFeeCents + (driverBears && extrasCents > 0 ? extrasStripeCents : 0);
  const extrasViaStripeCents = Math.max(0, extrasCents - extrasAppFeeCents);

  const totalEarnedCents = driverViaStripeCents + cashAtPickupCents + extrasViaStripeCents;

  return NextResponse.json({
    fare,
    deposit,
    cashAtPickup: round2(cashAtPickupCents),
    driverViaStripe: round2(driverViaStripeCents),
    hmuFee: round2(hmuFeeNetCents),
    stripeFee: round2(stripeFeeCents),
    stripeBearer: config.stripeFeeBearer,
    extras: {
      amount: round2(extrasCents),
      hmuFee: round2(extrasFeeCents),
      stripeFee: round2(extrasStripeCents),
      driverViaStripe: round2(extrasViaStripeCents),
    },
    totalEarned: round2(totalEarnedCents),
    config: {
      feePercent: config.feePercent,
      feeFloorCents: config.feeFloorCents,
      depositMin: config.depositMin,
      depositIncrement: config.depositIncrement,
      depositMaxPctOfFare: config.depositMaxPctOfFare,
      extrasFeePercent: config.extrasFeePercent,
      stripeFeeBearer: config.stripeFeeBearer,
    },
  });
}
