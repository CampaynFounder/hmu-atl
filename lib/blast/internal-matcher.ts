// InternalMatcher — Gate 2.2 wrapper around the existing matching pipeline
// in lib/blast/matching.ts. Conforms to the MatchingProvider interface from
// lib/blast/types.ts so the v3 fanout path can swap matchers via env var
// (D-7) without touching call sites.
//
// IMPORTANT: this is a TRANSPARENT WRAPPER. Behavior must be identical to
// what callers got from matchBlast() + fetchFallbackDrivers() before. Stream B
// will extend the underlying matcher to populate the full MatchResult shape
// (rawFeatures, normalizedFeatures, filterResults, fallbackDriverIds, etc.);
// for now we map what the existing pipeline returns and TODO the rest.
//
// See docs/BLAST-V3-AGENT-CONTRACT.md §3 D-7, §7, §11.4 (non-regression).

import { matchBlast, fetchFallbackDrivers, type ScoredTarget } from './matching';
import { getMatchingConfig, type BlastMatchingConfig } from './config';
import type {
  MatchingProvider,
  BlastCreateInput,
  BlastConfig,
  MatchResult,
  MatchCandidate,
} from './types';

export interface InternalMatchExtras {
  /** Final radius in miles after any expansion iterations. */
  finalRadiusMi: number;
  /** Number of radius expansion passes used (0..2). */
  expansionsUsed: number;
  /**
   * Raw v2 ScoredTarget rows (notified targets, in priority order). Carries
   * per-driver `distanceMi` and `tier` which the v3 MatchCandidate contract
   * doesn't (yet) expose but downstream persistence + push payloads need.
   * Lossless pass-through preserves byte-for-byte parity with the prior
   * direct matchBlast() call site.
   */
  rawTargets: ScoredTarget[];
  /** Raw v2 ScoredTarget rows for fallback drivers (notified_at = NULL path). */
  rawFallback: ScoredTarget[];
}

/**
 * Result of the internal matcher's match() call. The contract MatchResult
 * is the public shape; extras are surfaced for callers (currently the
 * /api/blast route) that need the radius/expansion details for response
 * payloads. New code should depend on MatchResult only.
 */
export interface InternalMatchOutput extends MatchResult {
  extras: InternalMatchExtras;
}

/**
 * Map a v3 BlastConfig back to the v2 BlastMatchingConfig that the existing
 * matchBlast() function expects. v3 BlastConfig.weights/hardFilters/limits are
 * loose Records; we layer them onto the typed v2 config so unset keys keep
 * their defaults. This isolates the v2 matcher from v3 contract drift.
 */
function toV2Config(v3: BlastConfig, baseline: BlastMatchingConfig): BlastMatchingConfig {
  // Surgical merge — only override keys the v3 config actually provides.
  // Defensive Number() casts: the JSONB origin of weights/limits/filters
  // means values can arrive as strings from the DB.
  const weights: BlastMatchingConfig['weights'] = { ...baseline.weights };
  for (const k of Object.keys(weights) as Array<keyof typeof weights>) {
    if (v3.weights[k as string] !== undefined) {
      weights[k] = Number(v3.weights[k as string]);
    }
  }
  const filters: BlastMatchingConfig['filters'] = { ...baseline.filters };
  for (const k of Object.keys(filters) as Array<keyof typeof filters>) {
    if (v3.hardFilters[k as string] !== undefined) {
      // Booleans pass through; numbers via Number() coercion.
      const raw = v3.hardFilters[k as string];
      (filters as Record<string, unknown>)[k as string] =
        typeof raw === 'boolean' ? raw : Number(raw);
    }
  }
  const limits: BlastMatchingConfig['limits'] = { ...baseline.limits };
  for (const k of Object.keys(limits) as Array<keyof typeof limits>) {
    if (v3.limits[k as string] !== undefined) {
      const raw = v3.limits[k as string];
      (limits as Record<string, unknown>)[k as string] =
        typeof raw === 'boolean' ? raw : Number(raw);
    }
  }
  return { ...baseline, weights, filters, limits };
}

/**
 * Map a v2 ScoredTarget into the v3 MatchCandidate contract. The existing
 * matcher does not (yet) emit raw/normalized features or per-filter results;
 * Stream B will extend the matcher to populate those. For now we leave them
 * empty so the contract is satisfied without changing matching behavior.
 *
 * TODO(stream-b): populate rawFeatures/normalizedFeatures from the underlying
 * candidate row, and filterResults from the SQL filter chain — required for
 * /admin/blast/[id] funnel observability per contract §3 D-9.
 */
function scoredTargetToCandidate(t: ScoredTarget): MatchCandidate {
  return {
    driverId: t.driverId,
    rawFeatures: {},
    normalizedFeatures: {},
    filterResults: [],
    score: t.matchScore,
    scoreBreakdown: t.scoreBreakdown,
  };
}

export class InternalMatcher implements MatchingProvider {
  readonly name = 'internal';

  /**
   * Run the matching pipeline and return the contract MatchResult (with
   * internal extras tacked on for the /api/blast route's response payload).
   *
   * Behavior preservation:
   *   - Calls matchBlast() with the same inputs as before.
   *   - Calls fetchFallbackDrivers() under the same condition
   *     (expansionsUsed >= 2 && targets.length < 3).
   *   - Same priority order, same caps, same dedup window.
   */
  async match(input: BlastCreateInput, config: BlastConfig): Promise<MatchResult> {
    return this.matchInternal(input, config);
  }

  /**
   * Internal-only entrypoint that exposes the radius/expansion extras the
   * existing route handler needs in its response. /api/blast uses this; new
   * code should prefer match() and depend on the contract shape only.
   */
  async matchInternal(
    input: BlastCreateInput,
    config: BlastConfig,
    opts: {
      riderId: string;
      marketId: string | null;
      driverPreference: 'male' | 'female' | 'any';
      riderGender: string | null;
    } | null = null,
  ): Promise<InternalMatchOutput> {
    // Pull the live v2 config and layer the v3 overrides on top so the existing
    // matcher sees a fully-defaulted shape. Until /admin/blast-config (Stream
    // E) writes the new blast_config table, the v3 config arriving here will
    // typically be a thin overlay derived from BlastMatchingConfig anyway.
    const baseline = await getMatchingConfig();
    const v2Config = toV2Config(config, baseline);

    if (!opts) {
      throw new Error('InternalMatcher.matchInternal requires runtime opts (riderId, marketId, driverPreference, riderGender)');
    }

    const { targets, finalRadiusMi, expansionsUsed } = await matchBlast(
      {
        riderId: opts.riderId,
        pickupLat: input.pickup.lat,
        pickupLng: input.pickup.lng,
        marketId: opts.marketId,
        driverPreference: opts.driverPreference,
        riderGender: opts.riderGender,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      },
      v2Config,
    );

    // Mirror the route handler's existing fallback condition.
    let fallback: ScoredTarget[] = [];
    if (expansionsUsed >= 2 && targets.length < 3) {
      fallback = await fetchFallbackDrivers(
        {
          riderId: opts.riderId,
          pickupLat: input.pickup.lat,
          pickupLng: input.pickup.lng,
          marketId: opts.marketId,
          driverPreference: opts.driverPreference,
          riderGender: opts.riderGender,
          scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        },
        v2Config,
        input.priceDollars,
      );
    }

    // Build the contract result. candidates includes notified targets first
    // (preserving rank order), then fallback. Stream B will broaden this to
    // include EVERY considered driver including filter-failed ones once the
    // matcher is extended; today the underlying SQL filters out failures
    // before they ever surface to TS.
    const notifiedCandidates = targets.map(scoredTargetToCandidate);
    const fallbackCandidates = fallback.map(scoredTargetToCandidate);

    return {
      configVersion: config.configVersion,
      providerName: this.name,
      candidates: [...notifiedCandidates, ...fallbackCandidates],
      notifiedDriverIds: targets.map((t) => t.driverId),
      fallbackDriverIds: fallback.map((f) => f.driverId),
      expandedRadius: expansionsUsed > 0,
      extras: {
        finalRadiusMi,
        expansionsUsed,
        rawTargets: targets,
        rawFallback: fallback,
      },
    };
  }
}
