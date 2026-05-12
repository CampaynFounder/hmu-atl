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

import { sql } from '@/lib/db/client';
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

let configCache: { config: DepositOnlyConfig; cachedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getDepositOnlyConfig(): Promise<DepositOnlyConfig> {
  if (configCache && Date.now() - configCache.cachedAt < CACHE_TTL_MS) {
    return configCache.config;
  }
  try {
    const rows = await sql`
      SELECT config FROM pricing_modes WHERE mode_key = 'deposit_only' LIMIT 1
    `;
    if (rows.length > 0) {
      const raw = (rows[0] as Record<string, unknown>).config;
      const dbConfig = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<DepositOnlyConfig>;
      const merged: DepositOnlyConfig = { ...DEFAULT_DEPOSIT_ONLY_CONFIG, ...dbConfig };
      configCache = { config: merged, cachedAt: Date.now() };
      return merged;
    }
  } catch (err) {
    console.error('[deposit-only] config load failed, using defaults:', err);
  }
  return DEFAULT_DEPOSIT_ONLY_CONFIG;
}

/** Test/dev helper: drop the config cache. */
export function _clearDepositOnlyConfigCache(): void {
  configCache = null;
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

    return {
      captureAmountCents: depositCents,
      applicationFeeCents: feeCents,
      driverReceives,
      platformReceives,
      stripeFee: 0, // Stripe processing fee is absorbed by connected account; not surfaced here.
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
        rows: [
          { label: 'Cash Received', value: cashTotal, role: 'total', audience: 'public' },
        ],
        extras: input.extras,
      };
    }

    const depositReceived = round2(input.driverPayoutAmount);
    const extrasPaid = round2(input.extrasDriverAmount);
    const hmuSplit = round2(input.platformFeeAmount + input.extrasPlatformFee);
    const stripeFee = round2(input.stripeFeeAmount + input.extrasStripeFee);
    const cashReceived = round2(Math.max(0, input.agreedPrice - input.visibleDeposit));
    const youEarned = round2(depositReceived + extrasPaid + cashReceived);
    const total = round2(depositReceived + extrasPaid + hmuSplit + stripeFee + cashReceived);

    return {
      modeKey: this.modeKey,
      isCash: false,
      youEarned,
      total,
      rows: [
        { label: 'Deposit Received', value: depositReceived, role: 'amount', audience: 'public' },
        { label: 'Extras Paid', value: extrasPaid, role: 'amount', audience: 'public' },
        { label: 'HMU Split', value: hmuSplit, role: 'muted', audience: 'driver_only' },
        { label: 'Stripe Fee', value: stripeFee, role: 'muted', audience: 'driver_only' },
        { label: 'Cash Received', value: cashReceived, role: 'amount', audience: 'public' },
        { label: 'Total', value: total, role: 'total', audience: 'public' },
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
