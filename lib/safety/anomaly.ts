// Server-side anomaly detection for active rides.
// Reads ride_locations (already populated by driver GPS publisher at 10s
// intervals) and flags rides whose trajectory looks off.
//
// MVP signals:
//   - gps_silence       — no new point in N seconds while ride is active
//   - stopped_too_long  — N consecutive points within M meters for T seconds
//   - speed_extreme     — implied speed between two points exceeds cap
//
// Intentionally omitted (punted to v2):
//   - off_route         — needs a cached Mapbox Directions polyline we don't
//                         capture yet. Add with a new rides.route_geometry col.
//   - wrong_direction   — noisy without route anchor; revisit after off_route.
//
// Each detection returns a normalized AnomalyHit the scheduler inserts into
// ride_safety_events and uses to trigger an anomaly_followup check-in to
// the affected party.

import { sql } from '@/lib/db/client';
import type { PlatformSafetyConfig, SafetyEventType, SafetyEventSeverity } from '@/lib/db/types';

export interface AnomalyHit {
  ride_id: string;
  event_type: SafetyEventType;
  severity: SafetyEventSeverity;
  // Which party the follow-up check should target. For anomalies that don't
  // point at one party (gps_silence is effectively a driver device problem;
  // stopped_too_long could be either) we prefer the rider — they're the one
  // whose safety is harder to signal.
  target_party: 'rider' | 'driver';
  location_lat: number | null;
  location_lng: number | null;
  evidence: Record<string, unknown>;
}

interface ActiveRideRow {
  ride_id: string;
  rider_id: string;
  driver_id: string;
}

// Haversine distance in meters between two lat/lng points.
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Load currently active rides (once per cron tick). */
async function loadActiveRides(): Promise<ActiveRideRow[]> {
  // The rides.status enum doesn't include 'in_progress' — the value used
  // during a ride is 'active'. Earlier code shipped with 'in_progress'
  // and silently matched zero rows for the entire safety subsystem.
  return (await sql`
    SELECT id AS ride_id, rider_id, driver_id
    FROM rides
    WHERE status = 'active'
  `) as ActiveRideRow[];
}

interface Point { lat: number; lng: number; recorded_at: Date; }

/** Pull the last N GPS fixes for a ride, newest first. */
async function loadRecentPoints(rideId: string, limit: number): Promise<Point[]> {
  const rows = (await sql`
    SELECT lat::float8 AS lat, lng::float8 AS lng, recorded_at
    FROM ride_locations
    WHERE ride_id = ${rideId}
    ORDER BY recorded_at DESC
    LIMIT ${limit}
  `) as Array<{ lat: number; lng: number; recorded_at: string }>;
  return rows.map((r) => ({ lat: r.lat, lng: r.lng, recorded_at: new Date(r.recorded_at) }));
}

function mostRecent(points: Point[]): Point | null {
  return points.length ? points[0] : null;
}

/** No GPS update in cfg.gps_silence_seconds. */
function checkGpsSilence(rideId: string, points: Point[], cfg: PlatformSafetyConfig, now: Date): AnomalyHit | null {
  const latest = mostRecent(points);
  // No points at all = silence too, but only after the ride has been running
  // past first-check delay. Cron cadence is once a minute so a transient empty
  // result is tolerable.
  if (!latest) return null;

  const ageSec = (now.getTime() - latest.recorded_at.getTime()) / 1000;
  if (ageSec < cfg.anomaly.gps_silence_seconds) return null;

  return {
    ride_id: rideId,
    event_type: 'gps_silence',
    severity: ageSec > cfg.anomaly.gps_silence_seconds * 2 ? 'high' : 'warn',
    target_party: 'rider', // rider can't help with GPS but they're the person at risk
    location_lat: latest.lat,
    location_lng: latest.lng,
    evidence: { age_seconds: Math.round(ageSec), threshold_seconds: cfg.anomaly.gps_silence_seconds },
  };
}

/** Successive points clustered within a small radius for too long. */
function checkStoppedTooLong(rideId: string, points: Point[], cfg: PlatformSafetyConfig, now: Date): AnomalyHit | null {
  if (points.length < 3) return null;
  const cutoff = cfg.anomaly.stopped_duration_seconds * 1000;
  const radius = cfg.anomaly.stopped_radius_meters;

  const anchor = points[0];
  // Walk backwards (older) until we leave the stop radius or run out of points.
  let windowStart = anchor.recorded_at;
  for (const p of points) {
    if (distanceMeters(anchor, p) > radius) break;
    windowStart = p.recorded_at;
  }

  const stoppedFor = now.getTime() - windowStart.getTime();
  if (stoppedFor < cutoff) return null;

  return {
    ride_id: rideId,
    event_type: 'stopped_too_long',
    severity: 'warn',
    target_party: 'rider',
    location_lat: anchor.lat,
    location_lng: anchor.lng,
    evidence: {
      stopped_seconds: Math.round(stoppedFor / 1000),
      threshold_seconds: cfg.anomaly.stopped_duration_seconds,
      radius_meters: radius,
    },
  };
}

/** Implied speed between two most recent fixes exceeds cap. */
function checkSpeedExtreme(rideId: string, points: Point[], cfg: PlatformSafetyConfig): AnomalyHit | null {
  if (points.length < 2) return null;
  const [a, b] = points; // a = newest, b = previous
  const seconds = (a.recorded_at.getTime() - b.recorded_at.getTime()) / 1000;
  if (seconds <= 0) return null;
  const meters = distanceMeters(a, b);
  const mph = (meters / seconds) * 2.23694;
  if (mph < cfg.anomaly.speed_max_mph) return null;

  return {
    ride_id: rideId,
    event_type: 'speed_extreme',
    severity: mph > cfg.anomaly.speed_max_mph * 1.2 ? 'high' : 'warn',
    target_party: 'rider',
    location_lat: a.lat,
    location_lng: a.lng,
    evidence: { mph: Math.round(mph), cap_mph: cfg.anomaly.speed_max_mph, sample_seconds: Math.round(seconds) },
  };
}

/**
 * Run all anomaly detectors for every active ride. Returns hits the caller
 * (scheduler cron) persists and acts on.
 *
 * Dedup happens at the scheduler layer — caller only inserts a new event when
 * the same (ride_id, event_type) doesn't already have an open row.
 */
export async function detectActiveRideAnomalies(
  cfg: PlatformSafetyConfig,
  now: Date = new Date(),
): Promise<AnomalyHit[]> {
  const rides = await loadActiveRides();
  if (rides.length === 0) return [];

  const hits: AnomalyHit[] = [];
  for (const ride of rides) {
    try {
      // 8 points ≈ 80s of history at 10s cadence — enough for our windows.
      const points = await loadRecentPoints(ride.ride_id, 8);

      const silence = checkGpsSilence(ride.ride_id, points, cfg, now);
      if (silence) { hits.push(silence); continue; /* if GPS is silent, don't trust other detectors */ }

      const stopped = checkStoppedTooLong(ride.ride_id, points, cfg, now);
      if (stopped) hits.push(stopped);

      const speed = checkSpeedExtreme(ride.ride_id, points, cfg);
      if (speed) hits.push(speed);
    } catch (err) {
      console.error('anomaly detection failed for', ride.ride_id, err);
    }
  }
  return hits;
}

/**
 * Returns true iff an open (unresolved) event of this type already exists for
 * the ride. Caller uses this to avoid re-inserting the same anomaly every tick.
 */
export async function hasOpenEvent(rideId: string, eventType: SafetyEventType): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM ride_safety_events
    WHERE ride_id = ${rideId} AND event_type = ${eventType} AND admin_resolved_at IS NULL
    LIMIT 1
  `) as Array<unknown>;
  return rows.length > 0;
}

/**
 * Picks which user_id to target for an anomaly_followup check-in given the
 * hit's target_party. Used by the scheduler.
 */
export async function loadRidePartyIds(rideId: string): Promise<{ rider_id: string; driver_id: string } | null> {
  const rows = (await sql`
    SELECT rider_id, driver_id FROM rides WHERE id = ${rideId} LIMIT 1
  `) as Array<{ rider_id: string; driver_id: string }>;
  return rows[0] ?? null;
}
