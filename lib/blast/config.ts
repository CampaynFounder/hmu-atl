// Typed reader for platform_config.blast_matching_v1 + the blast.* knobs.
// Defaults mirror the SQL seed in 2026-05-12-blast-booking.sql so missing
// config rows fail safe instead of producing weird behavior.
//
// Per-market overrides live under `blast_matching_v1:market:{slug}` rows and
// are deep-merged over the global row when getMatchingConfig(marketSlug) is
// called. Pricing fields are the primary use case today; other subsections
// (weights/filters/limits) deep-merge too if a market row sets them.

import { getPlatformConfig } from '@/lib/platform-config/get';

export type BlastMatchingConfig = {
  weights: {
    proximity_to_pickup: number;
    recency_signin: number;
    sex_match: number;
    chill_score: number;
    advance_notice_fit: number;
    profile_view_count: number;
    completed_rides: number;
    low_recent_pass_rate: number;
  };
  filters: {
    max_distance_mi: number;
    min_chill_score: number;
    must_match_sex_preference: boolean;
    must_be_signed_in_within_hours: number;
    exclude_if_in_active_ride: boolean;
    exclude_if_today_passed_count_gte: number;
  };
  limits: {
    max_drivers_to_notify: number;
    min_drivers_to_notify: number;
    expand_radius_step_mi: number;
    expand_radius_max_mi: number;
    same_driver_dedupe_minutes: number;
    prioritize_hmu_first: boolean;
    hmu_first_reserved_slots: number;
  };
  expiry: {
    default_blast_minutes: number;
    scheduled_blast_lead_minutes: number;
  };
  deposit: {
    default_amount_cents: number;
    percent_of_fare: number;
    max_deposit_cents: number;
  };
  // Pricing knobs used by /api/blast/estimate.
  // default_price_dollars is the UI's initial price suggestion (shown before
  // distance is known). The formula floor is minimum_fare_dollars.
  default_price_dollars: number;
  price_per_mile_dollars: number;
  max_price_dollars: number;
  base_fare_dollars: number;
  per_minute_cents: number;
  assumed_mph: number;
  minimum_fare_dollars: number;
} & Record<string, unknown>;

export const MATCHING_DEFAULTS: BlastMatchingConfig = {
  weights: {
    proximity_to_pickup: 0.30,
    recency_signin: 0.15,
    sex_match: 0.15,
    chill_score: 0.10,
    advance_notice_fit: 0.10,
    profile_view_count: 0.05,
    completed_rides: 0.05,
    low_recent_pass_rate: 0.10,
  },
  filters: {
    max_distance_mi: 5.0,
    min_chill_score: 50,
    must_match_sex_preference: false,
    must_be_signed_in_within_hours: 72,
    exclude_if_in_active_ride: true,
    exclude_if_today_passed_count_gte: 3,
  },
  limits: {
    max_drivers_to_notify: 10,
    min_drivers_to_notify: 3,
    expand_radius_step_mi: 1.0,
    expand_radius_max_mi: 15.0,
    same_driver_dedupe_minutes: 30,
    prioritize_hmu_first: false,
    hmu_first_reserved_slots: 0,
  },
  expiry: {
    default_blast_minutes: 15,
    scheduled_blast_lead_minutes: 60,
  },
  deposit: {
    default_amount_cents: 500,
    percent_of_fare: 0.50,
    max_deposit_cents: 5000,
  },
  default_price_dollars: 25,
  price_per_mile_dollars: 2.0,
  max_price_dollars: 200,
  base_fare_dollars: 3.0,
  per_minute_cents: 10,
  assumed_mph: 60,
  minimum_fare_dollars: 5.0,
};

// Deep-merge for the two-level nested config shape. Market overrides may set
// `pricing` subsection or any individual top-level field; we want a market
// that overrides only `per_minute_cents` to still inherit base, mile rate, etc.
function deepMergeConfig(
  base: BlastMatchingConfig,
  override: Partial<BlastMatchingConfig>,
): BlastMatchingConfig {
  const result = { ...base } as BlastMatchingConfig & Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    const baseVal = (base as Record<string, unknown>)[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = {
        ...(baseVal as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      };
    } else if (value !== undefined) {
      result[key] = value as unknown;
    }
  }
  return result;
}

export async function getMatchingConfig(
  marketSlug?: string | null,
): Promise<BlastMatchingConfig> {
  const global = await getPlatformConfig<BlastMatchingConfig>(
    'blast_matching_v1',
    MATCHING_DEFAULTS,
  );
  if (!marketSlug) return global;
  const marketKey = `blast_matching_v1:market:${marketSlug}`;
  // Missing market rows return defaults shape, so we cast the marketRow back
  // to a Partial — only its diff vs MATCHING_DEFAULTS is meaningful.
  const marketRow = await getPlatformConfig<BlastMatchingConfig>(
    marketKey,
    {} as BlastMatchingConfig,
  );
  return deepMergeConfig(global, marketRow);
}

// blast.* simple value knobs
export type SimpleValueConfig = { value: number | boolean | string } & Record<string, unknown>;

export async function getKnob<T extends number | boolean | string>(
  key: string,
  fallback: T,
): Promise<T> {
  const cfg = await getPlatformConfig<SimpleValueConfig>(key, { value: fallback });
  return (cfg.value as T) ?? fallback;
}
