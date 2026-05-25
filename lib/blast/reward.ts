// Stream E — per-market reward function resolver + reward computation.
// Per BLAST-V3-AGENT-CONTRACT.md §3 D-6 + project-per-market-config:
// reward functions are settable per market (with global default fallback).
//
// Pure functions. Caller composes outcomes from blast_match_log +
// blast_driver_targets + ride records and asks for the reward value.

import { sql } from '@/lib/db/client';
import type { RewardFunction } from './types';

export interface RewardOutcomeInput {
  /** Number of distinct drivers who responded (HMU or counter). */
  hmuCount: number;
  /** Number of distinct drivers who passed. */
  passCount: number;
  /** Number of drivers notified. */
  notifiedCount: number;
  /** Whether the blast was matched (rider selected). */
  matched: boolean;
  /** Whether the matched ride completed. */
  completed: boolean;
  /** Final ride revenue in dollars (0 if no completion). */
  rideRevenueDollars: number;
  /** Platform take rate (0..1). */
  takeRate: number;
  /** Time from blast creation to first HMU response, in seconds. null if no response. */
  secondsToFirstHmu: number | null;
}

/**
 * Compute the reward value for a single completed blast lifecycle under the
 * specified function. Higher = better.
 */
export function computeReward(fn: RewardFunction, outcome: RewardOutcomeInput): number {
  switch (fn) {
    case 'revenue_per_blast':
      return outcome.completed ? outcome.rideRevenueDollars * outcome.takeRate : 0;

    case 'accept_rate':
      // Fraction of notified drivers who responded affirmatively.
      if (outcome.notifiedCount === 0) return 0;
      return outcome.hmuCount / outcome.notifiedCount;

    case 'accept_x_completion':
      // Joint signal — high accept rate AND ride actually completed.
      if (outcome.notifiedCount === 0) return 0;
      const acceptRate = outcome.hmuCount / outcome.notifiedCount;
      return acceptRate * (outcome.completed ? 1 : 0);

    case 'time_to_first_hmu':
      // Inverted seconds — faster response = higher reward. Caps at 1 (≤30s)
      // and floors at 0 (no response within blast lifetime).
      if (outcome.secondsToFirstHmu === null) return 0;
      const minutes = outcome.secondsToFirstHmu / 60;
      return Math.max(0, Math.min(1, 1 / (1 + minutes)));

    default:
      return 0;
  }
}

/**
 * Resolve which reward function applies to a given market.
 * Reads from markets.reward_function (per-market override) with fallback
 * to the global default in blast_config (market_slug IS NULL).
 */
export async function getRewardFunctionForMarket(marketSlug: string | null): Promise<RewardFunction> {
  if (marketSlug) {
    const rows = await sql`
      SELECT reward_function FROM markets WHERE slug = ${marketSlug} LIMIT 1
    `;
    const market = rows[0] as { reward_function: string | null } | undefined;
    if (market?.reward_function && isRewardFunction(market.reward_function)) {
      return market.reward_function;
    }
  }
  // Fallback to global default config row.
  const globalRows = await sql`
    SELECT reward_function FROM blast_config WHERE market_slug IS NULL LIMIT 1
  `;
  const global = globalRows[0] as { reward_function: string | null } | undefined;
  if (global?.reward_function && isRewardFunction(global.reward_function)) {
    return global.reward_function;
  }
  return 'revenue_per_blast';
}

function isRewardFunction(s: string): s is RewardFunction {
  return s === 'revenue_per_blast'
    || s === 'accept_rate'
    || s === 'accept_x_completion'
    || s === 'time_to_first_hmu';
}

export const REWARD_FUNCTION_LABELS: Record<RewardFunction, string> = {
  revenue_per_blast: 'Revenue per blast',
  accept_rate: 'Accept rate',
  accept_x_completion: 'Accept × completion',
  time_to_first_hmu: 'Time to first HMU',
};

export const REWARD_FUNCTIONS: RewardFunction[] = [
  'revenue_per_blast',
  'accept_rate',
  'accept_x_completion',
  'time_to_first_hmu',
];
