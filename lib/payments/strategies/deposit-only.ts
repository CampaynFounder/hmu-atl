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
  depositRule: 'rider_select',
};

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
): number {
  const cap = Math.min(totalFare, totalFare * config.depositMaxPctOfFare);
  const min = Math.min(config.depositMin, totalFare); // never exceed total
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
    const visibleDeposit = clampDeposit(requested, input.agreedPrice, config);

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

    const feeCents = input.inFreeWindow ? 0 : calculateDepositFeeCents(depositCents, config);
    const platformFee = Math.round(feeCents) / 100;
    const waivedFee = input.inFreeWindow ? calculateDepositFeeCents(depositCents, config) / 100 : 0;
    const driverReceives = Math.round((depositCents - feeCents)) / 100;
    const platformReceives = Math.round(feeCents) / 100;
    // Estimate Stripe processing fee on the deposit so the ride-end breakdown
    // can show it as a real number. Standard US card rate: 2.9% + $0.30.
    // Stripe deducts this from the platform's net (application_fee) on
    // destination charges; the driver Connect amount is untouched.
    const stripeFee = (Math.round(depositCents * 0.029) + 30) / 100;

    return {
      captureAmountCents: depositCents,
      applicationFeeCents: feeCents,
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
    const feeCents = calculateDepositFeeCents(depositCents, config);
    const driverCents = Math.max(0, depositCents - feeCents);

    return {
      captureAmountCents: depositCents,
      applicationFeeCents: feeCents,
      driverAmount: Math.round(driverCents) / 100,
      platformAmount: Math.round(feeCents) / 100,
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

    const driverRows: BreakdownResult['driverRows'] = [
      { label: 'Deposit', value: round2(input.visibleDeposit), role: 'amount' },
      { label: 'Pull Up Cash', value: cashReceived, role: 'amount' },
      ...(extrasNet > 0 ? [{ label: 'HMU Extras', value: extrasNet, role: 'amount' as const }] : []),
      { label: 'HMU Fees Paid', value: hmuFeePaid, role: 'fee' },
      { label: 'Stripe Fees Paid', value: stripeFeePaid, role: 'fee' },
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
