// CompareSnapshot — derives marketing-display values from the live
// DepositOnlyConfig so the /compare page never drifts from actual pricing.
//
// Source of truth: pricing_modes.config (DB) → getDepositOnlyConfig().
// CMS controls the example fare and the surrounding copy; this helper
// computes every HMU pricing number shown on /compare.

import {
  getDepositOnlyConfig,
  clampDeposit,
  calculateDepositFeeCents,
} from './deposit-only';

export interface CompareSnapshot {
  /** Raw pricing config values, exposed for any caller that needs them. */
  config: {
    feePercent: number;
    feeFloorDollars: number;
  };
  /** Cells used to populate the HMU row in `grid_rows`. */
  gridCells: {
    feeShare: string;
    monthlyCost: string;
    joinCost: string;
    cashAllowed: string;
    youKeepExample: string;
  };
  /** Values used to replace an HMU entry in `example_scenarios`. */
  scenario: {
    rideTotal: string;
    platformTake: string;
    driverKeeps: string;
    breakdown: string;
  };
  /** Pre-rendered answer for the "what does HMU take" FAQ question. */
  hmuTakeAnswer: string;
  /** The example fare, echoed back so callers (e.g. column labels) can interpolate it. */
  exampleFareLabel: string;
}

const DEFAULT_EXAMPLE_FARE_DOLLARS = 20;
// Marketing demo deposit fraction. The strategy clamps this against
// config.depositMaxPctOfFare and config.depositMin, so this is a *request*
// — final deposit may differ.
const DEMO_DEPOSIT_FRACTION_OF_FARE = 0.4;

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function getCompareSnapshot(
  exampleFareDollars: number = DEFAULT_EXAMPLE_FARE_DOLLARS,
): Promise<CompareSnapshot> {
  const config = await getDepositOnlyConfig();
  const fare = Number.isFinite(exampleFareDollars) && exampleFareDollars > 0
    ? exampleFareDollars
    : DEFAULT_EXAMPLE_FARE_DOLLARS;

  const requestedDeposit = fare * DEMO_DEPOSIT_FRACTION_OF_FARE;
  const deposit = clampDeposit(requestedDeposit, fare, config);

  const fareCents = Math.round(fare * 100);
  const depositCents = Math.round(deposit * 100);
  const feeCents = calculateDepositFeeCents(depositCents, config);
  const driverInAppCents = Math.max(0, depositCents - feeCents);
  const cashCents = Math.max(0, fareCents - depositCents);
  const driverTotalCents = driverInAppCents + cashCents;

  const feePctInt = Math.round(config.feePercent * 100);
  const floorDollars = config.feeFloorCents / 100;
  const feeShare = `${feePctInt}% of deposit (min ${fmt(config.feeFloorCents)})`;

  return {
    config: {
      feePercent: config.feePercent,
      feeFloorDollars: floorDollars,
    },
    gridCells: {
      feeShare,
      monthlyCost: '$0',
      joinCost: 'Free forever',
      cashAllowed: 'Yes — driver collects',
      youKeepExample: fmt(driverTotalCents),
    },
    scenario: {
      rideTotal: fmt(fareCents),
      platformTake: fmt(feeCents),
      driverKeeps: fmt(driverTotalCents),
      breakdown: `${fmt(depositCents)} deposit captured → ${fmt(feeCents)} platform fee → ${fmt(driverInAppCents)} to driver in app + ${fmt(cashCents)} cash collected on arrival`,
    },
    hmuTakeAnswer: `On the deposit-only launch model: ${feePctInt}% of the deposit (with a ${fmt(config.feeFloorCents)} minimum). On a ${fmt(fareCents)} ride with a ${fmt(depositCents)} deposit, that's ${fmt(feeCents)}. Drivers keep the cash remainder directly.`,
    exampleFareLabel: fmt(fareCents),
  };
}
