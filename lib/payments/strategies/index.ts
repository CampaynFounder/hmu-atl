// Pricing strategy registry + resolver.
//
// resolvePricingStrategy(driverId) → returns the PricingStrategy for the given
// driver's active cohort assignment, falling back to the global-default mode,
// and ultimately falling back to LegacyFullFareStrategy if anything fails.
//
// Resolution order:
//   1. Driver has an explicit pricing_cohort_assignment row (expires_at IS NULL)
//      → use that cohort's pricing_mode
//   2. No assignment → use the pricing_mode where is_default_global = TRUE
//   3. DB error / table missing / no rows → LegacyFullFareStrategy (safety net)

import { sql } from '@/lib/db/client';
import type { PricingStrategy, ModeKey } from './types';
import { legacyFullFareStrategy } from './legacy-full-fare';
import { depositOnlyStrategy } from './deposit-only';

const registry = new Map<ModeKey, PricingStrategy>();
registry.set(legacyFullFareStrategy.modeKey, legacyFullFareStrategy);
registry.set(depositOnlyStrategy.modeKey, depositOnlyStrategy);

/** Register a strategy implementation. Phase B will register DepositOnlyStrategy. */
export function registerStrategy(strategy: PricingStrategy): void {
  registry.set(strategy.modeKey, strategy);
}

/** Look up a strategy by mode_key. Returns undefined if not registered. */
export function getStrategy(modeKey: ModeKey): PricingStrategy | undefined {
  return registry.get(modeKey);
}

/** All registered strategies. */
export function listStrategies(): PricingStrategy[] {
  return Array.from(registry.values());
}

interface ResolverCacheEntry {
  modeKey: ModeKey;
  cachedAt: number;
}

const driverModeCache = new Map<string, ResolverCacheEntry>();
const CACHE_TTL_MS = 60_000;

let globalDefaultCache: { modeKey: ModeKey; cachedAt: number } | null = null;

/**
 * Resolve the active pricing strategy for a driver. Always returns SOMETHING —
 * defaults to legacy_full_fare if any lookup fails so payments never break.
 */
export async function resolvePricingStrategy(driverId: string): Promise<PricingStrategy> {
  if (!driverId) return legacyFullFareStrategy;

  const cached = driverModeCache.get(driverId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return getStrategy(cached.modeKey) ?? legacyFullFareStrategy;
  }

  try {
    const rows = await sql`
      SELECT pm.mode_key
      FROM pricing_cohort_assignments pca
      JOIN pricing_cohorts pc ON pc.id = pca.cohort_id
      JOIN pricing_modes pm ON pm.id = pc.pricing_mode_id
      WHERE pca.user_id = ${driverId}
        AND pca.expires_at IS NULL
        AND pm.enabled = true
      ORDER BY pca.effective_at DESC
      LIMIT 1
    `;

    if (rows.length > 0) {
      const modeKey = (rows[0] as Record<string, unknown>).mode_key as string;
      driverModeCache.set(driverId, { modeKey, cachedAt: Date.now() });
      return getStrategy(modeKey) ?? (await resolveGlobalDefault());
    }
  } catch (err) {
    console.error('[pricing-strategies] driver resolve failed, falling through to global default:', err);
  }

  const fallback = await resolveGlobalDefault();
  driverModeCache.set(driverId, { modeKey: fallback.modeKey, cachedAt: Date.now() });
  return fallback;
}

/** Resolve the global-default pricing mode. Cached for 60s. */
export async function resolveGlobalDefault(): Promise<PricingStrategy> {
  if (globalDefaultCache && Date.now() - globalDefaultCache.cachedAt < CACHE_TTL_MS) {
    return getStrategy(globalDefaultCache.modeKey) ?? legacyFullFareStrategy;
  }

  try {
    const rows = await sql`
      SELECT mode_key
      FROM pricing_modes
      WHERE is_default_global = true AND enabled = true
      LIMIT 1
    `;
    if (rows.length > 0) {
      const modeKey = (rows[0] as Record<string, unknown>).mode_key as string;
      globalDefaultCache = { modeKey, cachedAt: Date.now() };
      return getStrategy(modeKey) ?? legacyFullFareStrategy;
    }
  } catch (err) {
    console.error('[pricing-strategies] global default resolve failed, using legacy_full_fare:', err);
  }

  globalDefaultCache = { modeKey: legacyFullFareStrategy.modeKey, cachedAt: Date.now() };
  return legacyFullFareStrategy;
}

/** Test/dev helper: clear all caches. */
export function _clearStrategyCaches(): void {
  driverModeCache.clear();
  globalDefaultCache = null;
}

export type { PricingStrategy } from './types';
export { legacyFullFareStrategy };
export { depositOnlyStrategy };
