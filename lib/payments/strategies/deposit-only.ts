// DepositOnlyStrategy — launch promo pricing.
//
// Behavior:
//   - Stripe authorizes ONLY the rider-selected deposit (not the full fare).
//   - Driver collects the cash remainder off-platform on arrival.
//   - At Start Ride, capture = full deposit; application_fee = max(floor, % × deposit).
//   - At no-show, capture = full deposit; application_fee = same fee math; rider gets nothing.
//   - At before-OTW cancel, auth is voided (no capture).
//   - At after-OTW cancel, driver gets 100% of deposit (no platform fee — matches legacy).
//
// Config lives in pricing_modes.config JSONB so admin can tune without deploy.

import { getPaymentsConfig } from '@/lib/payments/config';
import type {
  PricingStrategy,
  HoldInput,
  HoldDecision,
  CaptureInput,
  CaptureDecision,
  NoShowInput,
  NoShowDecision,
  CancelInput,
  CancelDecision,
  BreakdownInput,
  BreakdownResult,
} from './types';

export interface DepositOnlyConfig {
  /** Platform fee floor in cents. */
  feeFloorCents: number;
  /** Platform fee percent of deposit (0.20 = 20%). */
  feePercent: number;
  /** Minimum deposit in dollars. */
  depositMin: number;
  /** Increment in dollars (deposit must round to multiples of this). */
  depositIncrement: number;
  /** Max deposit as a fraction of total fare (0.5 = up to 50%). */
  depositMaxPctOfFare: number;
  /** What the driver keeps on no-show (1.0 = 100% of deposit minus fee). */
  noShowDriverPct: number;
  /**
   * Platform fee percent of each confirmed add-on (0.20 = 20%). Each extra
   * is charged through Stripe at driver-confirm time as a destination charge
   * with application_fee_amount = round(subtotalCents × extrasFeePercent).
   */
  extrasFeePercent: number;
  /**
   * Who bears Stripe's processing fee (2.9% + $0.30 on the deposit).
   *  - 'platform' (default): HMU absorbs it; driver receives deposit − platform
   *    fee, Stripe's slice comes out of HMU's margin.
   *  - 'driver': application_fee = platform fee + Stripe fee, so the driver
   *    receives deposit − platform fee − Stripe fee and HMU keeps the full
   *    platform fee. Superadmin-tunable to adjust the profit margin in real time.
   */
  stripeFeeBearer: 'platform' | 'driver';
  /** Future modes: 'rider_select' (current), 'distance_band', 'percent_of_fare'. */
  depositRule?: 'rider_select' | 'distance_band' | 'percent_of_fare';
}

export const DEFAULT_DEPOSIT_ONLY_CONFIG: DepositOnlyConfig = {
  feeFloorCents: 150,
  feePercent: 0.20,
  depositMin: 5,
  depositIncrement: 1,
  depositMaxPctOfFare: 0.5,
  noShowDriverPct: 1.0,
  extrasFeePercent: 0.20,
  stripeFeeBearer: 'platform',
  depositRule: 'rider_select',
};

/** Standard US card processing fee on an amount in cents: 2.9% + $0.30. */
export function estimateStripeFeeCents(amountCents: number): number {
  if (amountCents <= 0) return 0;
  return Math.round(amountCents * 0.029) + 30;
}

/** Platform fee in cents on a single add-on subtotal. Floor not applied here. */
export function calculateExtrasFeeCents(subtotalCents: number, config: DepositOnlyConfig): number {
  return Math.max(0, Math.round(subtotalCents * config.extrasFeePercent));
}

/** Test/dev helper: no-op — cache is now inside getPlatformConfig. */
export function _clearDepositOnlyConfigCache(): void { /* no-op */ }

export async function getDepositOnlyConfig(): Promise<DepositOnlyConfig> {
  try {
    const cfg = await getPaymentsConfig();
    return { ...DEFAULT_DEPOSIT_ONLY_CONFIG, ...cfg.depositOnly };
  } catch (err) {
    console.error('[deposit-only] config load failed, using defaults:', err);
    return DEFAULT_DEPOSIT_ONLY_CONFIG;
  }
}

/**
 * Clamp a requested deposit to the configured bounds and round to the nearest
 * increment. Pure function — no DB.
 */
export function clampDeposit(
  requested: number,
  totalFare: number,
  config: DepositOnlyConfig,
  // A driver's configured deposit floor (dollars). When set, the EFFECTIVE
  // minimum becomes the LOWER of the platform default and this value, so a
  // driver who is happy to take a smaller deposit ("don't HMU for less than")
  // is never forced up to the platform default. Undefined = platform default.
  floorOverride?: number,
): number {
  const cap = Math.min(totalFare, totalFare * config.depositMaxPctOfFare);
  const effectiveMin = floorOverride != null && floorOverride > 0
    ? Math.min(config.depositMin, floorOverride)
    : config.depositMin;
  const min = Math.min(effectiveMin, totalFare); // never exceed total
  const clamped = Math.max(min, Math.min(requested, cap));
  const inc = Math.max(config.depositIncrement, 0.01);
  const rounded = Math.round(clamped / inc) * inc;
  // Re-clamp after rounding (rounding could push past the cap).
  const final = Math.max(min, Math.min(rounded, cap));
  return Math.round(final * 100) / 100;
}

/**
 * Platform fee in cents = max(floorCents, percent × depositCents).
 */
export function calculateDepositFeeCents(depositCents: number, config: DepositOnlyConfig): number {
  const percentFee = Math.round(depositCents * config.feePercent);
  return Math.max(config.feeFloorCents, percentFee);
}

export class DepositOnlyStrategy implements PricingStrategy {
  readonly modeKey = 'deposit_only';
  readonly displayName = 'Deposit-only (promo)';
  readonly allowsCashOnly = false;

  async calculateHold(input: HoldInput): Promise<HoldDecision> {
    const config = await getDepositOnlyConfig();
    const requested = input.selectedDeposit ?? config.depositMin;
    // selectedDeposit IS the driver's deposit_floor (see HoldInput). Treat it as
    // the floor override so the effective minimum is the lower of it and the
    // platform default — a high platform default never blocks a cheaper driver.
    const visibleDeposit = clampDeposit(requested, input.agreedPrice, config, input.selectedDeposit);

    // Deposit-only authorizes ONLY the deposit. Rider pays the cash remainder
    // to the driver in person.
    return {
      authorizeAmountCents: Math.round(visibleDeposit * 100),
      visibleDeposit,
      ridePrice: input.agreedPrice,
      addOnReserve: input.addOnReserve,
      holdMode: 'deposit_only',
    };
  }

  async calculateCapture(input: CaptureInput): Promise<CaptureDecision> {
    const config = await getDepositOnlyConfig();
    // In deposit-only, capture = the deposit that was authorized at Pull Up.
    // The deposit was clamped to fare bounds at hold time and stored in
    // rides.visible_deposit.
    const depositCents = Math.round(input.visibleDeposit * 100);

    // HMU's platform fee (the configurable margin) = max(floor, % × deposit).
    const baseFeeCents = input.inFreeWindow ? 0 : calculateDepositFeeCents(depositCents, config);
    // Stripe's processing slice on the deposit (2.9% + $0.30).
    const stripeFeeCents = estimateStripeFeeCents(depositCents);

    // Who bears the Stripe fee is superadmin-configurable. On a destination
    // charge Stripe always deducts its fee from the platform's application_fee.
    //  - 'platform': application_fee = baseFee → driver gets deposit − baseFee;
    //    HMU nets baseFee − stripeFee (HMU absorbs Stripe). Default = today's behavior.
    //  - 'driver': application_fee = baseFee + stripeFee → driver gets
    //    deposit − baseFee − stripeFee; HMU keeps the full baseFee as margin.
    // In the free window baseFee = 0 and we never load Stripe onto the driver.
    const driverBearsStripe = config.stripeFeeBearer === 'driver' && !input.inFreeWindow;
    const applicationFeeCents = baseFeeCents + (driverBearsStripe ? stripeFeeCents : 0);

    // platformFee mirrors what we store as rides.platform_fee_amount (the gross
    // application fee the platform collects). The driver-facing breakdown derives
    // HMU's net vs Stripe's slice from platform_fee_amount − stripe_fee_amount,
    // so both bearer modes reconcile without any breakdown change.
    const platformFee = Math.round(applicationFeeCents) / 100;
    const waivedFee = input.inFreeWindow ? calculateDepositFeeCents(depositCents, config) / 100 : 0;
    const driverReceives = Math.round((depositCents - applicationFeeCents)) / 100;
    // Gross application fee the platform collects (Stripe then deducts its slice
    // from this on the destination charge). HMU's *net* margin is shown in the
    // driver breakdown as platform_fee_amount − stripe_fee_amount.
    const platformReceives = Math.round(applicationFeeCents) / 100;
    const stripeFee = stripeFeeCents / 100;

    return {
      captureAmountCents: depositCents,
      applicationFeeCents,
      driverReceives,
      platformReceives,
      stripeFee,
      platformFee,
      waivedFee,
      dailyCapHit: false, // Deposit-only mode does not use daily/weekly caps.
      weeklyCapHit: false,
      tierLabel: input.driverTier === 'hmu_first' ? 'HMU First' : 'Free',
    };
  }

  async calculateNoShow(input: NoShowInput): Promise<NoShowDecision> {
    // Locked design: driver keeps 100% of deposit minus fee. There are no
    // separate add-ons in this mode — only the deposit was ever authorized.
    const config = await getDepositOnlyConfig();
    const depositCents = Math.round(input.visibleDeposit * 100);
    const baseFeeCents = calculateDepositFeeCents(depositCents, config);
    // Honor the same Stripe-fee bearer setting as a normal capture.
    const applicationFeeCents = baseFeeCents
      + (config.stripeFeeBearer === 'driver' ? estimateStripeFeeCents(depositCents) : 0);
    const driverCents = Math.max(0, depositCents - applicationFeeCents);

    return {
      captureAmountCents: depositCents,
      applicationFeeCents,
      driverAmount: Math.round(driverCents) / 100,
      platformAmount: Math.round(applicationFeeCents) / 100,
      riderRefunded: 0,
      addOnRefunded: 0,
    };
  }

  buildBreakdownRows(input: BreakdownInput): BreakdownResult {
    const round2 = (n: number) => Math.round(n * 100) / 100;

    if (input.isCash) {
      const cashTotal = round2(input.agreedPrice + input.addOnTotal);
      return {
        modeKey: this.modeKey,
        isCash: true,
        youEarned: cashTotal,
        total: cashTotal,
        driverRows: [
          { label: 'Cash Received', value: cashTotal, role: 'total' },
        ],
        riderRows: [
          { label: 'Cash Paid', value: cashTotal, role: 'total' },
        ],
        extras: input.extras,
      };
    }

    // ── Money-conservation math ──────────────────────────────────────
    // Rider pays = visibleDeposit + sum(succeeded extra subtotals) + cash
    //            = agreedPrice + sum(succeeded extra subtotals)
    //
    // Driver receives:
    //   depositNet   = visibleDeposit − platformFeeAmount   (Stripe Connect payout)
    //   extrasNet    = extrasDriverAmount                   (extras already net of fees)
    //   cashReceived = agreedPrice − visibleDeposit         (0-fee Pull Up Cash)
    //   youEarned    = depositNet + extrasNet + cashReceived
    //
    // Fee display (deposit-only; extras fees are baked into extrasDriverAmount):
    //   hmuFeePaid    = platformFeeAmount − stripeFeeAmount  (HMU's net cut)
    //   stripeFeePaid = stripeFeeAmount                     (Stripe's processing slice)
    //   hmuFeePaid + stripeFeePaid = platformFeeAmount
    //   → visibleDeposit − hmuFeePaid − stripeFeePaid = depositNet ✓
    // ─────────────────────────────────────────────────────────────────
    const succeededExtrasSubtotal = round2(
      input.extras
        .filter(e => e.chargeStatus === 'succeeded')
        .reduce((s, e) => s + e.subtotal, 0)
    );

    const depositNet = round2(input.driverPayoutAmount);
    const extrasNet = round2(input.extrasDriverAmount);
    const hmuFeePaid = round2(Math.max(0, input.platformFeeAmount - input.stripeFeeAmount));
    const stripeFeePaid = round2(input.stripeFeeAmount);
    const cashReceived = round2(Math.max(0, input.agreedPrice - input.visibleDeposit));

    const youEarned = round2(depositNet + extrasNet + cashReceived);
    const total = round2(input.agreedPrice + succeededExtrasSubtotal);

    // Base Ride Fare is shown as muted CONTEXT only — it is NOT summed into the
    // total. The additive identity the driver can verify is:
    //   deposit + cash + extrasNet − hmuFee − stripeFee = Total Earnings
    // (Pull Up Cash = fare − deposit; extras are charged digitally on top of
    // the fare, so they never reduce the cash the rider hands over.)
    const driverRows: BreakdownResult['driverRows'] = [
      { label: 'Base Ride Fare', value: round2(input.agreedPrice), role: 'muted' },
      { label: 'Deposit Collected by HMU', value: round2(input.visibleDeposit), role: 'amount' },
      { label: 'Cash Paid Directly to You', value: cashReceived, role: 'amount' },
      ...(extrasNet > 0 ? [{ label: 'Extras (paid in app)', value: extrasNet, role: 'amount' as const }] : []),
      { label: 'HMU Fee', value: hmuFeePaid, role: 'fee' },
      { label: 'Stripe Processing', value: stripeFeePaid, role: 'fee' },
      { label: 'Total Earnings', value: youEarned, role: 'total' },
    ];

    return {
      modeKey: this.modeKey,
      isCash: false,
      youEarned,
      total,
      driverRows,
      riderRows: [
        { label: 'Deposit', value: round2(input.visibleDeposit), role: 'amount' },
        { label: 'HMU Extras', value: succeededExtrasSubtotal, role: 'amount' },
        { label: 'Cash to Driver', value: cashReceived, role: 'amount' },
        { label: 'Total', value: total, role: 'total' },
      ],
      extras: input.extras,
    };
  }

  async calculateCancel(input: CancelInput): Promise<CancelDecision> {
    if (input.phase === 'before_otw') {
      // Auth is voided; nothing captured.
      return {
        captureAmountCents: 0,
        applicationFeeCents: 0,
        driverAmount: 0,
        platformAmount: 0,
        riderRefunded: input.visibleDeposit,
      };
    }
    // After OTW: driver burned gas. Match legacy default — driver gets the
    // full deposit, platform takes nothing on cancel.
    const captureCents = Math.round(input.visibleDeposit * 100);
    return {
      captureAmountCents: captureCents,
      applicationFeeCents: 0,
      driverAmount: input.visibleDeposit,
      platformAmount: 0,
      riderRefunded: 0,
    };
  }
}

export const depositOnlyStrategy = new DepositOnlyStrategy();
