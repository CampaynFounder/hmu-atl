import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

// Whitelists so clients can't inject arbitrary strings into CHECK-constrained
// columns. Kept in lock-step with the CHECK constraints in
// lib/db/migrations/ride-safety-checks.sql.
const EVENT_TYPES = [
  'off_route', 'stopped_too_long', 'gps_silence', 'wrong_direction', 'speed_extreme',
  'check_in_alert', 'distress_admin', 'distress_911', 'distress_contact', 'ignored_streak',
] as const;
const SEVERITIES = ['info', 'warn', 'high', 'critical'] as const;
const PARTIES = ['rider', 'driver', 'system'] as const;
const SCOPES = ['open', 'recent', 'all'] as const;

function pickEnum<T extends readonly string[]>(val: string | null, allowed: T): T[number] | null {
  if (!val) return null;
  return (allowed as readonly string[]).includes(val) ? (val as T[number]) : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const url = new URL(req.url);
  const scope = pickEnum(url.searchParams.get('scope'), SCOPES) ?? 'open';
  const eventType = pickEnum(url.searchParams.get('event_type'), EVENT_TYPES);
  const severity = pickEnum(url.searchParams.get('severity'), SEVERITIES);
  const party = pickEnum(url.searchParams.get('party'), PARTIES);
  // Explicit resolved filter, independent of scope. Used by archive.
  //   'true'  → only rows already resolved
  //   'false' → only rows still open
  //   null    → no restriction (combined with scope)
  const resolvedParam = url.searchParams.get('resolved');
  const resolvedFilter = resolvedParam === 'true' || resolvedParam === 'false' ? resolvedParam : null;
  // q matches rider/driver display_name (ILIKE) OR a prefix of ride_id/event_id.
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80) || null;
  const startDate = url.searchParams.get('start_date');
  const endDate = url.searchParams.get('end_date');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  // scope drives the base predicate on admin_resolved_at:
  //   open   → only unresolved
  //   recent → only recently detected (all statuses)  — sorted DESC
  //   all    → no restriction, paginated
  const onlyOpen = scope === 'open';

  // For 'q' we match a prefix of the event or ride UUID string representation
  // as well as doing ILIKE on display names. UUID casts don't support ILIKE so
  // we cast to TEXT first.
  const qLike = q ? `%${q}%` : null;
  const qPrefix = q ? `${q}%` : null;

  // One combined query. The (param::type IS NULL OR col = param) idiom keeps
  // filters optional without building dynamic SQL.
  const rows = (await sql`
    SELECT
      e.id, e.ride_id, e.event_type, e.severity, e.party,
      e.detected_at, e.location_lat, e.location_lng, e.evidence,
      e.admin_resolved_at, e.admin_resolved_by, e.admin_notes,
      r.status AS ride_status,
      rider.id AS rider_id,
      driver.id AS driver_id,
      rp.display_name AS rider_name, rp.phone AS rider_phone,
      dp.display_name AS driver_name, dp.phone AS driver_phone,
      COUNT(*) OVER () AS total_count
    FROM ride_safety_events e
    INNER JOIN rides r ON r.id = e.ride_id
    LEFT JOIN users rider ON rider.id = r.rider_id
    LEFT JOIN users driver ON driver.id = r.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = rider.id
    LEFT JOIN driver_profiles dp ON dp.user_id = driver.id
    WHERE (${onlyOpen}::boolean = FALSE OR e.admin_resolved_at IS NULL)
      AND (
        ${resolvedFilter}::text IS NULL
        OR (${resolvedFilter} = 'true'  AND e.admin_resolved_at IS NOT NULL)
        OR (${resolvedFilter} = 'false' AND e.admin_resolved_at IS NULL)
      )
      AND (${eventType}::text IS NULL OR e.event_type = ${eventType})
      AND (${severity}::text IS NULL  OR e.severity = ${severity})
      AND (${party}::text IS NULL     OR e.party = ${party})
      AND (${startDate}::timestamptz IS NULL OR e.detected_at >= ${startDate}::timestamptz)
      AND (${endDate}::timestamptz IS NULL   OR e.detected_at <= ${endDate}::timestamptz)
      AND (
        ${qLike}::text IS NULL
        OR rp.display_name ILIKE ${qLike}
        OR dp.display_name ILIKE ${qLike}
        OR e.ride_id::text LIKE ${qPrefix}
        OR e.id::text LIKE ${qPrefix}
      )
    ORDER BY
      CASE WHEN ${scope}::text = 'open' THEN
        CASE e.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'warn' THEN 3 ELSE 4 END
      END ASC NULLS LAST,
      e.detected_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `) as Array<Record<string, unknown>>;

  // Always return the open ride-ids set — live-map needs it regardless of filters.
  const openRideIds = (await sql`
    SELECT DISTINCT ride_id FROM ride_safety_events
    WHERE admin_resolved_at IS NULL
  `) as Array<{ ride_id: string }>;

  const totalCount = rows.length ? Number(rows[0].total_count) : 0;
  const events = rows.map((r) => {
    const { total_count: _tc, ...rest } = r;
    void _tc;
    return rest;
  });

  return NextResponse.json({
    events,
    openRideIds: openRideIds.map((r) => r.ride_id),
    pagination: { total: totalCount, limit, offset, hasMore: offset + events.length < totalCount },
  });
}
