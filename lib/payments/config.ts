// Payment configuration — stored in platform_config and deep-merged per market.
// Keys: `payments:global` + `payments:global:market:{slug}`.
// Changes propagate within ~60s (in-memory cache TTL in getPlatformConfig).

import { getPlatformConfig } from '@/lib/platform-config/get';

export interface AddOnReserveConfig {
  /** How to compute the add-on reserve pre-authorized at COO time. */
  mode: 'menu_total_capped' | 'percent_of_fare' | 'none';
  /** Fraction of ride price used as the floor for the cap (default 0.25 = 25%). */
  percentFloor: number;
  /** Hard floor in dollars — cap is never less than this (default $50). */
  absoluteFloorDollars: number;
}

export interface LegacyFullFareConfig {
  /** How to compute the visible deposit shown to the rider (auth is always full fare). */
  visibleDepositMode: 'deposit_percent' | 'deposit_fixed' | 'full';
  /** Fraction of fare shown as deposit (for deposit_percent mode). */
  visibleDepositPercent: number;
  /** Fixed visible deposit in dollars (for deposit_fixed mode). */
  visibleDepositFixed: number;
  /** Minimum visible deposit in dollars. */
  visibleDepositMinimum: number;
}

export interface DepositOnlyPayConfig {
  /** Platform fee floor in cents. */
  feeFloorCents: number;
  /** Platform fee as a fraction of deposit (0.20 = 20%). */
  feePercent: number;
  /** Minimum deposit in dollars. */
  depositMin: number;
  /** Deposit increment in dollars. */
  depositIncrement: number;
  /** Max deposit as a fraction of total fare. */
  depositMaxPctOfFare: number;
  /** Platform fee on each confirmed add-on. */
  extrasFeePercent: number;
  /**
   * Who bears Stripe's processing fee (2.9% + $0.30).
   *  - 'platform' (default): HMU absorbs it out of its platform fee. Driver
   *    receives deposit − platform fee; HMU nets platform fee − Stripe fee.
   *  - 'driver': the driver bears it. application_fee = platform fee + Stripe
   *    fee, so the driver receives deposit − platform fee − Stripe fee and HMU
   *    keeps the full platform fee as margin.
   * Superadmin-tunable in real time to dial the profit margin.
   */
  stripeFeeBearer: 'platform' | 'driver';
}

export interface PaymentsConfig {
  addOnReserve: AddOnReserveConfig;
  legacyFullFare: LegacyFullFareConfig;
  depositOnly: DepositOnlyPayConfig;
}

export const PAYMENTS_DEFAULTS: PaymentsConfig = {
  addOnReserve: {
    mode: 'menu_total_capped',
    percentFloor: 0.25,
    absoluteFloorDollars: 50,
  },
  legacyFullFare: {
    visibleDepositMode: 'deposit_percent',
    visibleDepositPercent: 0.25,
    visibleDepositFixed: 5,
    visibleDepositMinimum: 5,
  },
  depositOnly: {
    feeFloorCents: 150,
    feePercent: 0.20,
    depositMin: 5,
    depositIncrement: 1,
    depositMaxPctOfFare: 0.50,
    extrasFeePercent: 0.20,
    stripeFeeBearer: 'platform',
  },
};

function deepMergePayments(base: PaymentsConfig, override: Partial<PaymentsConfig>): PaymentsConfig {
  return {
    addOnReserve: { ...base.addOnReserve, ...(override.addOnReserve ?? {}) },
    legacyFullFare: { ...base.legacyFullFare, ...(override.legacyFullFare ?? {}) },
    depositOnly: { ...base.depositOnly, ...(override.depositOnly ?? {}) },
  };
}

type PaymentsConfigRecord = Record<string, unknown> & PaymentsConfig;

export async function getPaymentsConfig(marketSlug?: string | null): Promise<PaymentsConfig> {
  const global = await getPlatformConfig<PaymentsConfigRecord>(
    'payments:global',
    PAYMENTS_DEFAULTS as PaymentsConfigRecord,
  );
  if (!marketSlug) return global;
  const marketRow = await getPlatformConfig<Record<string, unknown>>(
    `payments:global:market:${marketSlug}`,
    {},
  );
  return deepMergePayments(global, marketRow as Partial<PaymentsConfig>);
}

/**
 * Compute the add-on reserve from config given a driver's menu total and ride price.
 * Returns 0 if mode is 'none' or menu is empty.
 */
export function computeAddOnReserve(
  menuTotal: number,
  ridePrice: number,
  config: AddOnReserveConfig,
): number {
  if (config.mode === 'none' || menuTotal <= 0) return 0;
  if (config.mode === 'percent_of_fare') {
    return Math.round(ridePrice * config.percentFloor * 100) / 100;
  }
  // mode === 'menu_total_capped': min(menuTotal, max(absoluteFloor, fare * percentFloor))
  const cap = Math.max(config.absoluteFloorDollars, ridePrice * config.percentFloor);
  return Math.round(Math.min(menuTotal, cap) * 100) / 100;
}
