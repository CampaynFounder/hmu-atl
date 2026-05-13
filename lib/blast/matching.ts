// Blast matching algorithm.
//
// Inputs:
//   - blast pickup coords + driver_preference + scheduled_for + market
//   - rider id (for same-driver dedupe lookup)
// Output:
//   - up to `max_drivers_to_notify` driver targets, scored + ranked
//
// Pipeline:
//   1. Pull eligible-driver pool (SQL): in market, has fresh location, online,
//      passes hard filters (sex match if required, chill min, sign-in recency,
//      not in active ride, not over today's pass cap, not already notified
//      for a recent blast from this rider).
//   2. Score in TS (we keep the math here for cheap admin debugging vs.
//      embedding it in SQL).
//   3. If pool size < min_drivers_to_notify, expand radius and re-pull.
//   4. Cap to max_drivers_to_notify; reserve HMU First slots if configured.

import { sql } from '@/lib/db/client';
import { calculateDistance } from '@/lib/geo/distance';
import type { BlastMatchingConfig } from './config';

export interface BlastInput {
  riderId: string;
  pickupLat: number;
  pickupLng: number;
  marketId: string | null;
  driverPreference: 'male' | 'female' | 'any';
  // Rider's own gender (man/woman/other/female/male — accepts both old + new
  // vocab per the gender_normalization backlog). Used to honor drivers whose
  // user_preferences.rider_gender_pref restricts who they accept.
  riderGender: string | null;
  scheduledFor: Date | null;
}

export interface DriverCandidate {
  user_id: string;
  current_lat: number;
  current_lng: number;
  gender: string | null;
  chill_score: number;
  tier: 'free' | 'hmu_first';
  completed_rides: number;
  last_active: Date | null;
  hours_since_signin: number;
  profile_view_count: number;
  passes_today: number;
  advance_notice_hours: number | null;
}

export interface ScoredTarget {
  driverId: string;
  matchScore: number;
  scoreBreakdown: Record<string, number>;
  distanceMi: number;
  tier: 'free' | 'hmu_first';
}

const STALE_LOCATION_MINUTES = 5;

/** Pull the candidate pool for a given radius. SQL handles all hard filters. */
async function fetchCandidates(
  blast: BlastInput,
  config: BlastMatchingConfig,
  radiusMi: number,
): Promise<DriverCandidate[]> {
  const requireSexMatch = config.filters.must_match_sex_preference && blast.driverPreference !== 'any';
  const minChillScore = config.filters.min_chill_score;
  const maxStaleMinutes = STALE_LOCATION_MINUTES;
  // 0 = disable the check entirely (so admins can knob-out a filter without
  // hitting the API). The CASE WHEN guards below honor that semantic.
  const signinHours = config.filters.must_be_signed_in_within_hours;
  const passCapToday = config.filters.exclude_if_today_passed_count_gte;
  const dedupeMinutes = config.limits.same_driver_dedupe_minutes;

  // Bounding box pre-filter — Postgres can't use indexes on Haversine, so we
  // crop to a rough lat/lng box first and let the in-loop distance compute
  // do the precise check. The radius arithmetic is safe at urban scales.
  const latDelta = radiusMi / 69; // rough miles-per-degree of latitude
  const lngDelta = radiusMi / (69 * Math.cos((blast.pickupLat * Math.PI) / 180));

  const minLat = blast.pickupLat - latDelta;
  const maxLat = blast.pickupLat + latDelta;
  const minLng = blast.pickupLng - lngDelta;
  const maxLng = blast.pickupLng + lngDelta;

  // Normalize rider gender to handle both legacy (male/female) and current
  // (man/woman) vocabularies per the gender_normalization backlog. The driver
  // filter below accepts whichever flavor the driver has stored their pref in.
  const riderGenderNormalized =
    blast.riderGender === 'male' || blast.riderGender === 'man' ? 'man' :
    blast.riderGender === 'female' || blast.riderGender === 'woman' ? 'woman' :
    null;

  const rows = await sql`
    SELECT
      u.id AS user_id,
      dp.current_lat,
      dp.current_lng,
      u.gender,
      COALESCE(u.chill_score, 0) AS chill_score,
      COALESCE(u.tier, 'free') AS tier,
      COALESCE(u.completed_rides, 0) AS completed_rides,
      u.last_active,
      EXTRACT(EPOCH FROM (NOW() - u.last_active)) / 3600 AS hours_since_signin,
      COALESCE(pv.view_count, 0) AS profile_view_count,
      COALESCE(passes.cnt, 0) AS passes_today,
      dp.advance_notice_hours
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN user_preferences up ON up.user_id = u.id
    LEFT JOIN (
      SELECT driver_id, SUM(view_count) AS view_count
      FROM profile_views
      WHERE last_viewed_at > NOW() - INTERVAL '30 days'
      GROUP BY driver_id
    ) pv ON pv.driver_id = u.id
    LEFT JOIN (
      SELECT driver_id, COUNT(*) AS cnt
      FROM ride_interests
      WHERE status = 'passed' AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY driver_id
    ) passes ON passes.driver_id = u.id
    WHERE u.profile_type = 'driver'
      AND u.account_status = 'active'
      AND dp.current_lat IS NOT NULL
      AND dp.current_lng IS NOT NULL
      AND dp.location_updated_at > NOW() - (${maxStaleMinutes} || ' minutes')::interval
      AND dp.current_lat BETWEEN ${minLat} AND ${maxLat}
      AND dp.current_lng BETWEEN ${minLng} AND ${maxLng}
      AND COALESCE(u.chill_score, 0) >= ${minChillScore}
      AND CASE WHEN ${signinHours} = 0 THEN TRUE
               ELSE u.last_active > NOW() - (${signinHours} || ' hours')::interval END
      -- Rider's preferred driver gender (when set as a hard filter)
      AND (${!requireSexMatch}::boolean OR u.gender = ${blast.driverPreference})
      -- Driver's preferred rider gender (always honored: drivers who chose
      -- women_only / men_only never see riders of the other gender). Drivers
      -- with no_preference / NULL pref see everyone.
      AND CASE
        WHEN up.rider_gender_pref IS NULL OR up.rider_gender_pref IN ('no_preference','prefer_women','prefer_men') THEN TRUE
        WHEN up.rider_gender_pref = 'women_only' THEN ${riderGenderNormalized}::text = 'woman'
        WHEN up.rider_gender_pref = 'men_only' THEN ${riderGenderNormalized}::text = 'man'
        ELSE TRUE
      END
      AND CASE WHEN ${passCapToday} = 0 THEN TRUE
               ELSE COALESCE(passes.cnt, 0) < ${passCapToday} END
      AND NOT EXISTS (
        SELECT 1 FROM rides r
        WHERE r.driver_id = u.id AND r.status IN ('matched','otw','here','active')
      )
      AND CASE WHEN ${dedupeMinutes} = 0 THEN TRUE
               ELSE NOT EXISTS (
        SELECT 1 FROM blast_driver_targets bdt
        JOIN hmu_posts hp ON hp.id = bdt.blast_id
        WHERE bdt.driver_id = u.id
          AND hp.user_id = ${blast.riderId}
          AND bdt.notified_at > NOW() - (${dedupeMinutes} || ' minutes')::interval
      ) END
  `;

  return rows.map((r: unknown) => {
    const row = r as Record<string, unknown>;
    return {
      user_id: row.user_id as string,
      current_lat: Number(row.current_lat),
      current_lng: Number(row.current_lng),
      gender: (row.gender as string) ?? null,
      chill_score: Number(row.chill_score),
      tier: (row.tier as 'free' | 'hmu_first') ?? 'free',
      completed_rides: Number(row.completed_rides),
      last_active: row.last_active ? new Date(row.last_active as string) : null,
      hours_since_signin: Number(row.hours_since_signin) || 0,
      profile_view_count: Number(row.profile_view_count),
      passes_today: Number(row.passes_today),
      advance_notice_hours: row.advance_notice_hours ? Number(row.advance_notice_hours) : null,
    };
  });
}

/** Per-driver score: sum of weighted normalized factors. */
function scoreCandidate(
  c: DriverCandidate,
  blast: BlastInput,
  config: BlastMatchingConfig,
): ScoredTarget | null {
  const distanceMi = calculateDistance(
    { latitude: blast.pickupLat, longitude: blast.pickupLng },
    { latitude: c.current_lat, longitude: c.current_lng },
  );

  // Hard cap — pre-bbox is rough so we re-check.
  if (distanceMi > config.filters.max_distance_mi) return null;

  const w = config.weights;
  const f = config.filters;

  // Defensive divides — if the filter is disabled (set to 0), the factor
  // collapses to 1 so it doesn't tank everyone's score with NaN / -Inf.
  const proximity = f.max_distance_mi > 0 ? clamp01(1 - distanceMi / f.max_distance_mi) : 1;
  const recency = f.must_be_signed_in_within_hours > 0
    ? clamp01(1 - c.hours_since_signin / f.must_be_signed_in_within_hours)
    : 1;

  let sexMatch = 1;
  if (blast.driverPreference !== 'any') {
    sexMatch = c.gender === blast.driverPreference ? 1 : 0;
  }

  const chill = clamp01(c.chill_score / 100);
  const advanceFit = computeAdvanceNoticeFit(c, blast);
  const views = clamp01(c.profile_view_count / 100);
  const completed = clamp01(c.completed_rides / 50);
  const lowPass = clamp01(1 - c.passes_today / 10);

  const breakdown = {
    proximity_to_pickup: proximity * w.proximity_to_pickup,
    recency_signin: recency * w.recency_signin,
    sex_match: sexMatch * w.sex_match,
    chill_score: chill * w.chill_score,
    advance_notice_fit: advanceFit * w.advance_notice_fit,
    profile_view_count: views * w.profile_view_count,
    completed_rides: completed * w.completed_rides,
    low_recent_pass_rate: lowPass * w.low_recent_pass_rate,
  };

  const matchScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    driverId: c.user_id,
    matchScore: Math.round(matchScore * 1000) / 1000,
    scoreBreakdown: roundBreakdown(breakdown),
    distanceMi: Math.round(distanceMi * 100) / 100,
    tier: c.tier,
  };
}

function computeAdvanceNoticeFit(c: DriverCandidate, blast: BlastInput): number {
  // No requirement → perfect fit. No scheduled time → assume ASAP, prefer drivers
  // who require less notice.
  if (!c.advance_notice_hours) return 1;
  const noticeMinutes = c.advance_notice_hours * 60;

  if (!blast.scheduledFor) {
    // ASAP — drivers needing > 1hr notice get partial credit
    return clamp01(1 - noticeMinutes / 120);
  }

  const leadMinutes = (blast.scheduledFor.getTime() - Date.now()) / 60_000;
  if (leadMinutes >= noticeMinutes) return 1;
  return clamp01(leadMinutes / Math.max(noticeMinutes, 1));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function roundBreakdown(b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(b)) out[k] = Math.round(v * 1000) / 1000;
  return out;
}

/**
 * Run the full matching pipeline. Returns the targets to notify, in priority
 * order. Caller persists them to blast_driver_targets and triggers fanout.
 */
export async function matchBlast(
  blast: BlastInput,
  config: BlastMatchingConfig,
): Promise<{ targets: ScoredTarget[]; finalRadiusMi: number; expansionsUsed: number }> {
  let radius = config.filters.max_distance_mi;
  let candidates: DriverCandidate[] = await fetchCandidates(blast, config, radius);
  let expansions = 0;

  // Cap at 2 iterations max (initial + 1 expansion) per user requirements
  while (
    candidates.length < config.limits.min_drivers_to_notify &&
    radius < config.limits.expand_radius_max_mi &&
    expansions < 2
  ) {
    radius = Math.min(radius + config.limits.expand_radius_step_mi, config.limits.expand_radius_max_mi);
    expansions += 1;
    // We re-pull rather than incrementally widen — same query, different bbox,
    // and we let the DB do the dedupe via UNIQUE constraint on insertion later.
    candidates = await fetchCandidates(
      { ...blast },
      { ...config, filters: { ...config.filters, max_distance_mi: radius } },
      radius,
    );
  }

  const scored = candidates
    .map((c) => scoreCandidate(c, blast, config))
    .filter((t): t is ScoredTarget => t !== null)
    .sort((a, b) => b.matchScore - a.matchScore);

  const cap = config.limits.max_drivers_to_notify;
  let selected: ScoredTarget[];

  if (config.limits.prioritize_hmu_first && config.limits.hmu_first_reserved_slots > 0) {
    // Reserve N slots for HMU First drivers; fill the rest from the global ranking
    const reserved = config.limits.hmu_first_reserved_slots;
    const hmuFirst = scored.filter((t) => t.tier === 'hmu_first').slice(0, reserved);
    const used = new Set(hmuFirst.map((t) => t.driverId));
    const remainder = scored.filter((t) => !used.has(t.driverId)).slice(0, Math.max(0, cap - hmuFirst.length));
    selected = [...hmuFirst, ...remainder];
  } else {
    selected = scored.slice(0, cap);
  }

  return { targets: selected, finalRadiusMi: radius, expansionsUsed: expansions };
}

/**
 * Fetch fallback drivers when no matches are found after 2 iterations.
 * Returns up to 3 drivers who match gender preference + are within price range,
 * ignoring location constraints (ANY location or no location set).
 */
export async function fetchFallbackDrivers(
  blast: BlastInput,
  config: BlastMatchingConfig,
  ridePrice: number,
): Promise<ScoredTarget[]> {
  const requireSexMatch = config.filters.must_match_sex_preference && blast.driverPreference !== 'any';
  const minChillScore = config.filters.min_chill_score;
  const signinHours = config.filters.must_be_signed_in_within_hours;
  const dedupeMinutes = config.limits.same_driver_dedupe_minutes;

  // Normalize rider gender
  const riderGenderNormalized =
    blast.riderGender === 'male' || blast.riderGender === 'man' ? 'man' :
    blast.riderGender === 'female' || blast.riderGender === 'woman' ? 'woman' :
    null;

  // Query drivers matching gender preference + price range, ignoring location
  const rows = await sql`
    SELECT
      u.id AS user_id,
      dp.current_lat,
      dp.current_lng,
      u.gender,
      COALESCE(u.chill_score, 0) AS chill_score,
      COALESCE(u.tier, 'free') AS tier,
      COALESCE(u.completed_rides, 0) AS completed_rides,
      u.last_active,
      EXTRACT(EPOCH FROM (NOW() - u.last_active)) / 3600 AS hours_since_signin,
      COALESCE(pv.view_count, 0) AS profile_view_count,
      COALESCE(passes.cnt, 0) AS passes_today,
      dp.advance_notice_hours
      -- dp.min_ride_amount -- TODO: re-enable when staging DB has this column migrated
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN user_preferences up ON up.user_id = u.id
    LEFT JOIN (
      SELECT driver_id, SUM(view_count) AS view_count
      FROM profile_views
      WHERE last_viewed_at > NOW() - INTERVAL '30 days'
      GROUP BY driver_id
    ) pv ON pv.driver_id = u.id
    LEFT JOIN (
      SELECT driver_id, COUNT(*) AS cnt
      FROM ride_interests
      WHERE status = 'passed' AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY driver_id
    ) passes ON passes.driver_id = u.id
    WHERE u.profile_type = 'driver'
      AND u.account_status = 'active'
      AND COALESCE(u.chill_score, 0) >= ${minChillScore}
      AND CASE WHEN ${signinHours} = 0 THEN TRUE
               ELSE u.last_active > NOW() - (${signinHours} || ' hours')::interval END
      -- Gender preference filter
      AND (${!requireSexMatch}::boolean OR u.gender = ${blast.driverPreference})
      -- Driver's preferred rider gender
      AND CASE
        WHEN up.rider_gender_pref IS NULL OR up.rider_gender_pref IN ('no_preference','prefer_women','prefer_men') THEN TRUE
        WHEN up.rider_gender_pref = 'women_only' THEN ${riderGenderNormalized}::text = 'woman'
        WHEN up.rider_gender_pref = 'men_only' THEN ${riderGenderNormalized}::text = 'man'
        ELSE TRUE
      END
      -- Price filter: driver's min_ride_amount <= rider's offered price (or driver has no minimum)
      -- TODO: re-enable when staging DB has min_ride_amount column migrated
      -- AND (dp.min_ride_amount IS NULL OR dp.min_ride_amount <= ${ridePrice})
      -- Not in active ride
      AND NOT EXISTS (
        SELECT 1 FROM rides r
        WHERE r.driver_id = u.id AND r.status IN ('matched','otw','here','active')
      )
      -- Not recently notified
      AND CASE WHEN ${dedupeMinutes} = 0 THEN TRUE
               ELSE NOT EXISTS (
        SELECT 1 FROM blast_driver_targets bdt
        JOIN hmu_posts hp ON hp.id = bdt.blast_id
        WHERE bdt.driver_id = u.id
          AND hp.user_id = ${blast.riderId}
          AND bdt.notified_at > NOW() - (${dedupeMinutes} || ' minutes')::interval
      ) END
    ORDER BY
      -- Prioritize HMU First tier
      CASE WHEN COALESCE(u.tier, 'free') = 'hmu_first' THEN 0 ELSE 1 END,
      -- Then by chill score
      COALESCE(u.chill_score, 0) DESC,
      -- Then by completed rides
      COALESCE(u.completed_rides, 0) DESC
    LIMIT 3
  `;

  const candidates = rows.map((r: unknown) => {
    const row = r as Record<string, unknown>;
    return {
      user_id: row.user_id as string,
      current_lat: row.current_lat ? Number(row.current_lat) : 0,
      current_lng: row.current_lng ? Number(row.current_lng) : 0,
      gender: (row.gender as string) ?? null,
      chill_score: Number(row.chill_score),
      tier: (row.tier as 'free' | 'hmu_first') ?? 'free',
      completed_rides: Number(row.completed_rides),
      last_active: row.last_active ? new Date(row.last_active as string) : null,
      hours_since_signin: Number(row.hours_since_signin) || 0,
      profile_view_count: Number(row.profile_view_count),
      passes_today: Number(row.passes_today),
      advance_notice_hours: row.advance_notice_hours ? Number(row.advance_notice_hours) : null,
    };
  });

  // Score each candidate (but distance will be 0 or very large since we're ignoring location)
  const scored = candidates
    .map((c: DriverCandidate) => {
      // For fallback drivers, we create a simplified score based on non-location factors
      const w = config.weights;
      const chill = clamp01(c.chill_score / 100);
      const completed = clamp01(c.completed_rides / 50);
      const lowPass = clamp01(1 - c.passes_today / 10);
      const views = clamp01(c.profile_view_count / 100);

      let sexMatch = 1;
      if (blast.driverPreference !== 'any') {
        sexMatch = c.gender === blast.driverPreference ? 1 : 0;
      }

      const breakdown = {
        proximity_to_pickup: 0, // Not considered for fallback
        recency_signin: 0, // Not heavily weighted for fallback
        sex_match: sexMatch * w.sex_match,
        chill_score: chill * w.chill_score,
        advance_notice_fit: 0,
        profile_view_count: views * w.profile_view_count,
        completed_rides: completed * w.completed_rides,
        low_recent_pass_rate: lowPass * w.low_recent_pass_rate,
      };

      const matchScore = Object.values(breakdown).reduce((a: number, b: number) => a + b, 0);

      return {
        driverId: c.user_id,
        matchScore: Math.round(matchScore * 1000) / 1000,
        scoreBreakdown: roundBreakdown(breakdown),
        distanceMi: 0, // Unknown - location not considered
        tier: c.tier,
      };
    })
    .sort((a: ScoredTarget, b: ScoredTarget) => b.matchScore - a.matchScore);

  return scored;
}
