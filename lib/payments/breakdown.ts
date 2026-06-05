// Server-side ride breakdown for the ride-end page.
//
// Pulls raw money values off the rides + ride_add_ons rows, then hands them
// to the ride's PricingStrategy via buildBreakdownRows() — the strategy owns
// the labels, row set, and audience visibility. UI just renders whatever
// rows it gets, which keeps display logic per-mode without UI branching.
//
// Dispatch order:
//   1. rides.pricing_mode_key (stamped at hold time / COO)
//   2. getStrategy(mode_key) lookup
//   3. legacy_full_fare as final safety net
//
// This decouples the post-ride view from the driver's current cohort. Even
// if the driver moves cohorts after the ride, the breakdown stays consistent
// with the strategy the ride was actually run under.

import { sql } from '@/lib/db/client';
import { getStrategy, legacyFullFareStrategy } from './strategies';
import type { BreakdownExtra, BreakdownResult } from './strategies/types';

/**
 * Build the full ride breakdown by delegating to the ride's strategy.
 * Returns null only if the ride row doesn't exist.
 */
export async function computeRideBreakdown(rideId: string): Promise<BreakdownResult | null> {
  const rideRows = await sql`
    SELECT
      id, is_cash, final_agreed_price, amount, pricing_mode_key,
      visible_deposit, add_on_total,
      driver_payout_amount, platform_fee_amount, stripe_fee_amount
    FROM rides WHERE id = ${rideId} LIMIT 1
  `;
  if (!rideRows.length) return null;
  const ride = rideRows[0] as Record<string, unknown>;

  const addOnRows = await sql`
    SELECT id, name, subtotal, status, stripe_charge_status,
           platform_fee_cents, driver_amount_cents, stripe_fee_cents
    FROM ride_add_ons
    WHERE ride_id = ${rideId} AND status NOT IN ('removed', 'rejected')
    ORDER BY added_at
  ` as Array<Record<string, unknown>>;

  return buildBreakdownFromRows(ride, addOnRows);
}

/**
 * Columns the breakdown needs off a `rides` row. Any query feeding
 * buildBreakdownFromRows / computeBreakdownsForRides must select these.
 */
export const BREAKDOWN_RIDE_COLUMNS =
  'is_cash, final_agreed_price, amount, pricing_mode_key, visible_deposit, ' +
  'add_on_total, driver_payout_amount, platform_fee_amount, stripe_fee_amount';

/**
 * Pure-ish breakdown builder: given a `rides` row (with the columns in
 * BREAKDOWN_RIDE_COLUMNS) and its `ride_add_ons` rows, delegate to the ride's
 * pricing strategy. No DB access — safe to call in a loop after a batched fetch.
 */
export function buildBreakdownFromRows(
  ride: Record<string, unknown>,
  addOnRows: Array<Record<string, unknown>>,
): BreakdownResult {
  const isCash = !!ride.is_cash;
  const agreedPrice = Number(ride.final_agreed_price ?? ride.amount ?? 0);
  const visibleDeposit = Number(ride.visible_deposit ?? 0);
  const addOnTotal = Number(ride.add_on_total ?? 0);

  const extras: BreakdownExtra[] = addOnRows.map(r => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    subtotal: Number(r.subtotal ?? 0),
    driverAmount: Number(r.driver_amount_cents ?? 0) / 100,
    platformFee: Number(r.platform_fee_cents ?? 0) / 100,
    status: String(r.status ?? ''),
    chargeStatus: r.stripe_charge_status ? String(r.stripe_charge_status) : null,
  }));

  const succeededExtras = addOnRows.filter(r => r.stripe_charge_status === 'succeeded');
  const extrasDriverAmount = succeededExtras.reduce((s, r) => s + Number(r.driver_amount_cents ?? 0), 0) / 100;
  const extrasPlatformFee = succeededExtras.reduce((s, r) => s + Number(r.platform_fee_cents ?? 0), 0) / 100;
  const extrasStripeFee = succeededExtras.reduce((s, r) => s + Number(r.stripe_fee_cents ?? 0), 0) / 100;

  // Resolve strategy by the mode_key stamped on the ride. Falls back to
  // legacy_full_fare if the column is null (pre-migration row) or the
  // registry doesn't know about the mode.
  const modeKey = (ride.pricing_mode_key as string) || legacyFullFareStrategy.modeKey;
  const strategy = getStrategy(modeKey) ?? legacyFullFareStrategy;

  return strategy.buildBreakdownRows({
    isCash,
    agreedPrice,
    visibleDeposit,
    addOnTotal,
    driverPayoutAmount: Number(ride.driver_payout_amount ?? 0),
    platformFeeAmount: Number(ride.platform_fee_amount ?? 0),
    stripeFeeAmount: Number(ride.stripe_fee_amount ?? 0),
    extrasDriverAmount,
    extrasPlatformFee,
    extrasStripeFee,
    extras,
  });
}

/**
 * Batched breakdown for a list of ride rows (e.g. the My Rides page). Fetches
 * all add-ons in ONE query, then builds each breakdown in memory — avoids the
 * N+1 of calling computeRideBreakdown per ride. The passed ride rows must
 * include `id` plus BREAKDOWN_RIDE_COLUMNS.
 */
export async function computeBreakdownsForRides(
  rideRows: Array<Record<string, unknown>>,
): Promise<Map<string, BreakdownResult>> {
  const ids = rideRows.map(r => String(r.id));
  const out = new Map<string, BreakdownResult>();
  if (!ids.length) return out;

  const addOnRows = await sql`
    SELECT ride_id, id, name, subtotal, status, stripe_charge_status,
           platform_fee_cents, driver_amount_cents, stripe_fee_cents
    FROM ride_add_ons
    WHERE ride_id = ANY(${ids}::uuid[]) AND status NOT IN ('removed', 'rejected')
    ORDER BY added_at
  ` as Array<Record<string, unknown>>;

  const byRide = new Map<string, Array<Record<string, unknown>>>();
  for (const a of addOnRows) {
    const rid = String(a.ride_id);
    const list = byRide.get(rid) ?? [];
    list.push(a);
    byRide.set(rid, list);
  }

  for (const ride of rideRows) {
    out.set(String(ride.id), buildBreakdownFromRows(ride, byRide.get(String(ride.id)) ?? []));
  }
  return out;
}

export type { BreakdownResult, BreakdownExtra };
export type { BreakdownRow } from './strategies/types';
