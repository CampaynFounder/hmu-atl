import { sql } from '@/lib/db/client';

// ── Types ──

export interface HoldPolicy {
  id: string;
  tier: string;
  holdMode: 'full' | 'deposit_percent' | 'deposit_fixed';
  holdPercent: number | null;
  holdFixed: number | null;
  holdMinimum: number;
  cancelBeforeOtwRefundPct: number;
  cancelAfterOtwDriverPct: number;
  cancelAfterOtwPlatformPct: number;
  noShowPlatformTiers: NoShowTier[];
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface NoShowTier {
  up_to?: number;
  above?: number;
  rate: number;
}

export interface DepositResult {
  /** The amount Stripe authorizes (always full ride + reserve for capture ability) */
  stripeAuthAmount: number;
  /** The deposit amount shown to the rider */
  visibleDeposit: number;
  /** The full ride price */
  ridePrice: number;
  /** Add-on reserve */
  addOnReserve: number;
  /** Hold mode used */
  holdMode: string;
}

export interface CancelSplitResult {
  /** Amount charged to rider (capped at deposit) */
  riderCharged: number;
  /** Amount refunded to rider */
  riderRefunded: number;
  /** Amount driver receives */
  driverReceives: number;
  /** Amount platform receives */
  platformReceives: number;
  /** Phase when cancel happened */
  phase: 'before_otw' | 'after_otw';
}

export interface NoShowSplitResult {
  /** Total amount charged to rider (full ride price) */
  riderCharged: number;
  /** Amount driver receives */
  driverReceives: number;
  /** Amount platform receives (progressive) */
  platformReceives: number;
  /** Effective platform rate */
  effectiveRate: number;
  /** Breakdown of each tier applied */
  tierBreakdown: { slice: string; amount: number; rate: number; platformCut: number }[];
}

// ── Cache ──

let policyCache: Map<string, HoldPolicy> = new Map();
let policyCacheTime = 0;
const CACHE_TTL_MS = 60000;

// ── Default fallbacks ──

const DEFAULTS: Record<string, HoldPolicy> = {
  free: {
    id: 'default-free',
    tier: 'free',
    holdMode: 'deposit_percent',
    holdPercent: 0.25,
    holdFixed: null,
    holdMinimum: 5,
    cancelBeforeOtwRefundPct: 1.0,
    cancelAfterOtwDriverPct: 1.0,
    cancelAfterOtwPlatformPct: 0,
    noShowPlatformTiers: [
      { up_to: 15, rate: 0.05 },
      { up_to: 30, rate: 0.10 },
      { up_to: 60, rate: 0.15 },
      { above: 60, rate: 0.20 },
    ],
    effectiveFrom: '2026-04-13',
    effectiveTo: null,
    changeReason: null,
    isActive: true,
    createdAt: '',
  },
  hmu_first: {
    id: 'default-hmu-first',
    tier: 'hmu_first',
    holdMode: 'deposit_percent',
    holdPercent: 0.15,
    holdFixed: null,
    holdMinimum: 5,
    cancelBeforeOtwRefundPct: 1.0,
    cancelAfterOtwDriverPct: 1.0,
    cancelAfterOtwPlatformPct: 0,
    noShowPlatformTiers: [
      { up_to: 15, rate: 0.05 },
      { up_to: 30, rate: 0.08 },
      { up_to: 60, rate: 0.12 },
      { above: 60, rate: 0.15 },
    ],
    effectiveFrom: '2026-04-13',
    effectiveTo: null,
    changeReason: null,
    isActive: true,
    createdAt: '',
  },
};

// ── Lookup ──

export async function getHoldPolicy(tier: string): Promise<HoldPolicy> {
  if (Date.now() - policyCacheTime < CACHE_TTL_MS && policyCache.has(tier)) {
    return policyCache.get(tier)!;
  }

  try {
    const rows = await sql`
      SELECT *
      FROM hold_policy
      WHERE tier = ${tier} AND is_active = true
        AND effective_from <= CURRENT_DATE
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY effective_from DESC
      LIMIT 1
    `;

    if (rows.length > 0) {
      const r = rows[0] as Record<string, unknown>;
      const policy = mapRowToPolicy(r);
      policyCache.set(tier, policy);
      policyCacheTime = Date.now();
      return policy;
    }
  } catch (err) {
    console.error('Failed to load hold policy, using defaults:', err);
  }

  return DEFAULTS[tier] || DEFAULTS.free;
}

function mapRowToPolicy(r: Record<string, unknown>): HoldPolicy {
  return {
    id: r.id as string,
    tier: r.tier as string,
    holdMode: r.hold_mode as HoldPolicy['holdMode'],
    holdPercent: r.hold_percent != null ? Number(r.hold_percent) : null,
    holdFixed: r.hold_fixed != null ? Number(r.hold_fixed) : null,
    holdMinimum: Number(r.hold_minimum ?? 5),
    cancelBeforeOtwRefundPct: Number(r.cancel_before_otw_refund_pct ?? 1),
    cancelAfterOtwDriverPct: Number(r.cancel_after_otw_driver_pct ?? 1),
    cancelAfterOtwPlatformPct: Number(r.cancel_after_otw_platform_pct ?? 0),
    noShowPlatformTiers: (r.no_show_platform_tiers as NoShowTier[]) || [],
    effectiveFrom: r.effective_from as string,
    effectiveTo: r.effective_to as string | null,
    changeReason: r.change_reason as string | null,
    isActive: r.is_active as boolean,
    createdAt: r.created_at as string,
  };
}

// ── Deposit calculation ──

/**
 * Calculate how much to hold (Stripe auth) and how much to show the rider.
 *
 * IMPORTANT: Stripe always authorizes the FULL ride price + add-on reserve
 * so we can capture the full amount on completion. The "deposit" is what the
 * rider sees in the UI — their psychological commitment level.
 */
export function calculateDepositAmount(
  ridePrice: number,
  addOnReserve: number,
  policy: HoldPolicy
): DepositResult {
  let visibleDeposit: number;

  switch (policy.holdMode) {
    case 'deposit_percent': {
      const pct = policy.holdPercent ?? 0.25;
      visibleDeposit = ridePrice * pct;
      // Apply minimum floor
      visibleDeposit = Math.max(visibleDeposit, policy.holdMinimum);
      // Never exceed ride price
      visibleDeposit = Math.min(visibleDeposit, ridePrice);
      break;
    }
    case 'deposit_fixed': {
      visibleDeposit = policy.holdFixed ?? 5;
      visibleDeposit = Math.min(visibleDeposit, ridePrice);
      break;
    }
    case 'full':
    default:
      visibleDeposit = ridePrice;
      break;
  }

  visibleDeposit = Math.round(visibleDeposit * 100) / 100;

  return {
    stripeAuthAmount: ridePrice + addOnReserve,
    visibleDeposit,
    ridePrice,
    addOnReserve,
    holdMode: policy.holdMode,
  };
}

// ── Voluntary cancel split ──

/**
 * Calculate the split when a rider voluntarily cancels.
 * Charges are CAPPED at the visible deposit amount.
 */
export function calculateCancelSplit(
  visibleDeposit: number,
  phase: 'before_otw' | 'after_otw',
  policy: HoldPolicy
): CancelSplitResult {
  if (phase === 'before_otw') {
    // Rider gets back the configured refund percentage of the deposit
    const refundPct = policy.cancelBeforeOtwRefundPct;
    const riderRefunded = Math.round(visibleDeposit * refundPct * 100) / 100;
    const charged = Math.round((visibleDeposit - riderRefunded) * 100) / 100;
    // Whatever isn't refunded goes to driver (platform takes nothing before OTW)
    return {
      riderCharged: charged,
      riderRefunded,
      driverReceives: charged,
      platformReceives: 0,
      phase,
    };
  }

  // After OTW: driver burned gas and time
  const driverPct = policy.cancelAfterOtwDriverPct;
  const platformPct = policy.cancelAfterOtwPlatformPct;
  const driverReceives = Math.round(visibleDeposit * driverPct * 100) / 100;
  const platformReceives = Math.round(visibleDeposit * platformPct * 100) / 100;
  const riderRefunded = Math.round((visibleDeposit - driverReceives - platformReceives) * 100) / 100;

  return {
    riderCharged: visibleDeposit - Math.max(riderRefunded, 0),
    riderRefunded: Math.max(riderRefunded, 0),
    driverReceives,
    platformReceives,
    phase,
  };
}

// ── No-show split (progressive marginal tiers) ──

/**
 * Calculate the split when a rider no-shows.
 * The FULL ride price is charged. Platform takes a progressive cut.
 * Each dollar slice of the charge amount gets its own rate.
 */
export function calculateNoShowSplit(
  ridePrice: number,
  policy: HoldPolicy
): NoShowSplitResult {
  const tiers = policy.noShowPlatformTiers;

  if (!tiers.length) {
    // No tiers configured — driver gets everything
    return {
      riderCharged: ridePrice,
      driverReceives: ridePrice,
      platformReceives: 0,
      effectiveRate: 0,
      tierBreakdown: [],
    };
  }

  let platformTotal = 0;
  let remaining = ridePrice;
  let prevCeiling = 0;
  const breakdown: NoShowSplitResult['tierBreakdown'] = [];

  // Sort tiers: up_to ascending, then above last
  const sorted = [...tiers].sort((a, b) => {
    if (a.above != null) return 1;
    if (b.above != null) return -1;
    return (a.up_to ?? 0) - (b.up_to ?? 0);
  });

  for (const tier of sorted) {
    if (remaining <= 0) break;

    let sliceAmount: number;
    let sliceLabel: string;

    if (tier.up_to != null) {
      const ceiling = tier.up_to;
      sliceAmount = Math.min(remaining, ceiling - prevCeiling);
      sliceLabel = prevCeiling === 0
        ? `First $${ceiling}`
        : `$${prevCeiling} - $${ceiling}`;
      prevCeiling = ceiling;
    } else {
      // "above" tier — catches everything remaining
      sliceAmount = remaining;
      sliceLabel = `Over $${tier.above ?? prevCeiling}`;
    }

    if (sliceAmount <= 0) continue;

    const platformCut = Math.round(sliceAmount * tier.rate * 100) / 100;
    platformTotal += platformCut;
    remaining -= sliceAmount;

    breakdown.push({
      slice: sliceLabel,
      amount: Math.round(sliceAmount * 100) / 100,
      rate: tier.rate,
      platformCut,
    });
  }

  platformTotal = Math.round(platformTotal * 100) / 100;
  const driverReceives = Math.round((ridePrice - platformTotal) * 100) / 100;
  const effectiveRate = ridePrice > 0 ? platformTotal / ridePrice : 0;

  return {
    riderCharged: ridePrice,
    driverReceives,
    platformReceives: platformTotal,
    effectiveRate: Math.round(effectiveRate * 10000) / 10000,
    tierBreakdown: breakdown,
  };
}
