// No-Show Protection engine — shared by direct/blast/down-bad rides (Phase 0)
// and, later, deliveries (Phase 2).
//
// One deterministic signal — "verified arrival" (fresh, dwelling driver GPS
// within pickup proximity) measured against a fixed arrival deadline —
// arbitrates BOTH directions:
//   - driver never verified-arrived by the deadline  -> rider protected (void)
//   - driver verified-arrived but rider absent        -> driver protected (charge)
// The verdict is grounded in the driver's own mandatory GPS stream + the
// rider's shared location, so neither party can assert past it.
//
// Phase 0 is INERT: this module computes deadlines and writes shadow audit
// rows, but takes NO money action. Every function is best-effort and must
// never throw into a caller's request path — a failure here can degrade
// evidence but must not break OTW, location ingestion, or any live flow.
//
// The audit writer (writeAdjudication) persists the full rationale + a frozen
// policy snapshot to no_show_adjudications so ops, driver-facing explanations,
// and chargeback evidence all read from one tamper-evident source.

import { sql } from '@/lib/db/client';
import { getPlatformConfig } from '@/lib/platform-config/get';
import { calculateDistance, estimateETA, isWithinProximity, type Coordinates } from '@/lib/geo/distance';

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------

export type NoShowConfig = {
  /** Master enable for enforcement. Phase 0 ships false — evidence only. */
  enabled: boolean;
  /** Slack added on top of the estimated drive time before a driver is "late". */
  arrival_grace_sec: number;
  /** Continuous proximity time required to count as a real arrival (anti drive-by). */
  min_dwell_sec: number;
  /** Max age of the driver's last ping to be considered "present" (mirrors pulloff guard). */
  stale_sec: number;
  /** Pickup proximity radius that counts as "at pickup". */
  proximity_radius_ft: number;
  /** Floor on the drive-time estimate so short hops still get a fair deadline. */
  default_eta_floor_sec: number;
  /** Average speed used to turn straight-line distance into a drive-time estimate. */
  eta_avg_speed_mph: number;
  rider_late_nudge: boolean;
  driver_late_nudge: boolean;
  /** Configurable rider remedy; Phase 0 default 'void' (release hold only). */
  rider_remedy: 'void' | 'void_rematch_ding' | 'void_credit';
  /** Hybrid safety-net: auto-void N sec past deadline with no rider action. null = off. */
  auto_void_after_sec: number | null;
};

export const NO_SHOW_DEFAULTS: NoShowConfig = {
  enabled: false,
  arrival_grace_sec: 300,
  min_dwell_sec: 180,
  stale_sec: 120,
  proximity_radius_ft: 300,
  default_eta_floor_sec: 300,
  eta_avg_speed_mph: 25,
  rider_late_nudge: true,
  driver_late_nudge: true,
  rider_remedy: 'void',
  auto_void_after_sec: null,
};

/**
 * Effective no-show config, base 'no_show' merged with an optional
 * per-market override 'no_show:market:{slug}' (per the per-market-config
 * principle). Best-effort — falls back to defaults on any read error.
 */
export async function getNoShowConfig(marketSlug?: string | null): Promise<NoShowConfig> {
  const base = await getPlatformConfig<NoShowConfig>('no_show', NO_SHOW_DEFAULTS);
  if (!marketSlug) return base;
  try {
    const override = await getPlatformConfig<Partial<NoShowConfig>>(
      `no_show:market:${marketSlug}`,
      {} as Partial<NoShowConfig>,
    );
    return { ...base, ...override };
  } catch {
    return base;
  }
}

// ------------------------------------------------------------------
// Deadline (stamped once at OTW)
// ------------------------------------------------------------------

/**
 * Seconds from OTW until the driver is considered late, from the driver's
 * position at OTW to the pickup. Pure. Returns a floored estimate + grace so
 * a driver can't be flagged for a deadline that was never realistic; caller
 * stamps `now + this` into rides.arrival_deadline_at ONCE and never extends it.
 *
 * If the driver's OTW location is unknown, returns the floor + grace so the
 * deadline is still generous rather than absent.
 */
export function computeArrivalWindowSec(
  pickup: Coordinates | null,
  driverAtOtw: Coordinates | null,
  cfg: NoShowConfig,
): number {
  let etaSec = cfg.default_eta_floor_sec;
  if (pickup && driverAtOtw) {
    const miles = calculateDistance(driverAtOtw, pickup);
    etaSec = Math.max(cfg.default_eta_floor_sec, estimateETA(miles, cfg.eta_avg_speed_mph) * 60);
  }
  return etaSec + cfg.arrival_grace_sec;
}

// ------------------------------------------------------------------
// Fact gathering + adjudication
// ------------------------------------------------------------------

export type NoShowVerdict = 'driver_no_show' | 'rider_no_show' | 'connection' | 'en_route';

export interface NoShowFacts {
  rideId: string;
  bookingType: string | null;
  nowMs: number;
  arrivalDeadlineMs: number | null;
  driverArrivedAtMs: number | null;
  /** Continuous proximity dwell in seconds (0 if never arrived / drifted away). */
  driverDwellSec: number;
  /** Age of the driver's most recent ping, seconds (Infinity if none). */
  lastDriverPingAgeSec: number;
  hereVerified: boolean | null;
  driverDistFt: number | null;
  riderDistFt: number | null;
  /** Whether the rider's shared GPS is within proximity of pickup. */
  riderNearPickup: boolean | null;
}

/**
 * The verdict. Pure — reads only ground-truth facts, never a self-report.
 *
 *   !verifiedArrival && pastDeadline   -> driver_no_show  (rider protected)
 *    verifiedArrival && rider absent    -> rider_no_show   (driver protected)
 *    verifiedArrival && rider present    -> connection      (both here, no charge)
 *   !verifiedArrival && !pastDeadline    -> en_route        (no action yet)
 */
export function adjudicateNoShow(facts: NoShowFacts, cfg: NoShowConfig): NoShowVerdict {
  const verifiedArrival =
    facts.driverArrivedAtMs != null &&
    facts.driverDwellSec >= cfg.min_dwell_sec &&
    facts.lastDriverPingAgeSec <= cfg.stale_sec;

  const pastDeadline =
    facts.arrivalDeadlineMs != null && facts.nowMs > facts.arrivalDeadlineMs;

  if (verifiedArrival) {
    // Rider present (or unknown-but-not-clearly-absent) → treat as connection,
    // never silently charge on missing rider GPS.
    if (facts.riderNearPickup === false) return 'rider_no_show';
    return 'connection';
  }
  return pastDeadline ? 'driver_no_show' : 'en_route';
}

/**
 * Assemble the ground-truth facts for a ride from the DB. Best-effort:
 * on any error returns null so the caller can skip cleanly.
 */
export async function gatherNoShowFacts(
  rideId: string,
  cfg: NoShowConfig,
  nowMs: number,
): Promise<NoShowFacts | null> {
  try {
    const rideRows = (await sql`
      SELECT r.pickup_lat, r.pickup_lng, r.arrival_deadline_at, r.driver_arrived_at,
             r.here_verified, r.rider_lat, r.rider_lng, r.driver_id,
             p.post_type
      FROM rides r
      LEFT JOIN hmu_posts p ON p.id = r.hmu_post_id
      WHERE r.id = ${rideId}
      LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rideRows.length) return null;
    const r = rideRows[0];

    const pickup: Coordinates | null =
      r.pickup_lat != null && r.pickup_lng != null
        ? { latitude: Number(r.pickup_lat), longitude: Number(r.pickup_lng) }
        : null;

    // Latest driver ping for freshness + current distance.
    const pingRows = (await sql`
      SELECT lat, lng, recorded_at
      FROM ride_locations
      WHERE ride_id = ${rideId} AND user_id = ${r.driver_id as string}
      ORDER BY recorded_at DESC
      LIMIT 1
    `) as Array<Record<string, unknown>>;

    let lastDriverPingAgeSec = Infinity;
    let driverDistFt: number | null = null;
    if (pingRows.length) {
      const recordedMs = new Date(pingRows[0].recorded_at as string).getTime();
      lastDriverPingAgeSec = Math.max(0, Math.round((nowMs - recordedMs) / 1000));
      if (pickup) {
        driverDistFt = isWithinProximity(
          { latitude: Number(pingRows[0].lat), longitude: Number(pingRows[0].lng) },
          pickup,
          cfg.proximity_radius_ft,
        ).distanceFeet;
      }
    }

    const driverArrivedAtMs = r.driver_arrived_at
      ? new Date(r.driver_arrived_at as string).getTime()
      : null;
    // Dwell only counts if the driver is currently still in proximity and fresh.
    const stillClose =
      driverDistFt != null && driverDistFt <= cfg.proximity_radius_ft &&
      lastDriverPingAgeSec <= cfg.stale_sec;
    const driverDwellSec =
      driverArrivedAtMs != null && stillClose
        ? Math.max(0, Math.round((nowMs - driverArrivedAtMs) / 1000))
        : 0;

    let riderDistFt: number | null = null;
    let riderNearPickup: boolean | null = null;
    if (pickup && r.rider_lat != null && r.rider_lng != null) {
      const rp = isWithinProximity(
        { latitude: Number(r.rider_lat), longitude: Number(r.rider_lng) },
        pickup,
        cfg.proximity_radius_ft,
      );
      riderDistFt = rp.distanceFeet;
      riderNearPickup = rp.within;
    }

    return {
      rideId,
      bookingType: (r.post_type as string) ?? null,
      nowMs,
      arrivalDeadlineMs: r.arrival_deadline_at
        ? new Date(r.arrival_deadline_at as string).getTime()
        : null,
      driverArrivedAtMs,
      driverDwellSec,
      lastDriverPingAgeSec,
      hereVerified: (r.here_verified as boolean) ?? null,
      driverDistFt,
      riderDistFt,
      riderNearPickup,
    };
  } catch (err) {
    console.error('[no-show] gatherNoShowFacts failed:', err);
    return null;
  }
}

// ------------------------------------------------------------------
// Audit writer — auditability is a first-class output of the engine
// ------------------------------------------------------------------

export type NoShowTrigger = 'rider_tap' | 'cron_deadline' | 'driver_pulloff' | 'admin';
export type NoShowMoneyAction = 'none' | 'void' | 'no_show_capture' | 'blocked_driver_stale';

export interface WriteAdjudicationParams {
  rideId: string;
  subjectType?: 'ride' | 'delivery';
  bookingType: string | null;
  trigger: NoShowTrigger;
  triggeredBy?: string | null;
  verdict: NoShowVerdict;
  facts: NoShowFacts;
  policy: NoShowConfig;
  moneyAction?: NoShowMoneyAction;
  ledgerRef?: string | null;
  ledgerWriteOk?: boolean | null;
  stripePi?: string | null;
  /** Phase 0 = true (no enforcement). Later phases pass false for real verdicts. */
  shadow: boolean;
  supersedesId?: string | null;
}

/**
 * Append one adjudication row. NEVER throws — a durable-audit failure is logged
 * loudly ([no-show][AUDIT-FAILURE], greppable in wrangler tail) but must not
 * break the caller. Returns the new row id, or null on failure.
 */
export async function writeAdjudication(p: WriteAdjudicationParams): Promise<string | null> {
  const evidence = {
    arrival_deadline_ms: p.facts.arrivalDeadlineMs,
    driver_arrived_at_ms: p.facts.driverArrivedAtMs,
    driver_dwell_sec: p.facts.driverDwellSec,
    last_driver_ping_age_sec:
      p.facts.lastDriverPingAgeSec === Infinity ? null : p.facts.lastDriverPingAgeSec,
    here_verified: p.facts.hereVerified,
    driver_dist_ft: p.facts.driverDistFt,
    rider_dist_ft: p.facts.riderDistFt,
    rider_near_pickup: p.facts.riderNearPickup,
    now_ms: p.facts.nowMs,
    min_dwell_sec: p.policy.min_dwell_sec,
    stale_sec: p.policy.stale_sec,
    proximity_radius_ft: p.policy.proximity_radius_ft,
  };

  try {
    const rows = (await sql`
      INSERT INTO no_show_adjudications (
        ride_id, subject_type, booking_type, trigger, triggered_by, verdict,
        evidence, policy_snapshot, money_action, ledger_ref, ledger_write_ok,
        stripe_pi, shadow, supersedes_id
      ) VALUES (
        ${p.rideId}, ${p.subjectType ?? 'ride'}, ${p.bookingType}, ${p.trigger},
        ${p.triggeredBy ?? null}, ${p.verdict}, ${JSON.stringify(evidence)}::jsonb,
        ${JSON.stringify(p.policy)}::jsonb, ${p.moneyAction ?? 'none'},
        ${p.ledgerRef ?? null}, ${p.ledgerWriteOk ?? null}, ${p.stripePi ?? null},
        ${p.shadow}, ${p.supersedesId ?? null}
      )
      RETURNING id
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch (err) {
    // Loud, greppable — an unaudited money-adjacent decision is a real defect,
    // even in shadow mode where nothing moved.
    console.error('[no-show][AUDIT-FAILURE] writeAdjudication failed:', {
      rideId: p.rideId,
      verdict: p.verdict,
      trigger: p.trigger,
      err,
    });
    return null;
  }
}

/**
 * Convenience for the shadow path: gather facts, adjudicate, and audit in one
 * best-effort call. Takes NO money action. Safe to fire-and-forget from any
 * live route — never throws.
 */
export async function shadowAdjudicate(
  rideId: string,
  trigger: NoShowTrigger,
  opts: { triggeredBy?: string | null; marketSlug?: string | null; nowMs?: number } = {},
): Promise<void> {
  try {
    const cfg = await getNoShowConfig(opts.marketSlug ?? null);
    const nowMs = opts.nowMs ?? Date.now();
    const facts = await gatherNoShowFacts(rideId, cfg, nowMs);
    if (!facts) return;
    const verdict = adjudicateNoShow(facts, cfg);
    await writeAdjudication({
      rideId,
      bookingType: facts.bookingType,
      trigger,
      triggeredBy: opts.triggeredBy ?? null,
      verdict,
      facts,
      policy: cfg,
      moneyAction: 'none',
      shadow: true,
    });
  } catch (err) {
    console.error('[no-show] shadowAdjudicate failed:', err);
  }
}
