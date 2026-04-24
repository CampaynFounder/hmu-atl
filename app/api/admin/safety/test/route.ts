// Admin-only test harness for the safety pipeline.
//
// GET  ?q=<query> → ride picker autocomplete; matches ride ID prefix or
//   rider/driver display name. Returns up to 20 rides, newest first.
//
// POST → fires a real event through the production code path. Bypasses the
//   "you must be a party on this ride" guard used by the user-facing
//   respond/distress routes. Stamps evidence.source='admin_test' so the
//   queue/archive shows a TEST chip.
//
// Modes:
//   - prompt   : { mode, rideId, party, trigger?, autoDismissSeconds? }
//   - event    : { mode, rideId, eventType, severity, party, locationLat?, locationLng? }
//   - distress : { mode, rideId, party, kind }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, publishAdminEvent } from '@/lib/ably/server';
import { getPlatformSafetyConfig } from '@/lib/safety/config';
import type {
  SafetyCheckParty, SafetyCheckTrigger,
  SafetyEventType, SafetyEventSeverity, SafetyParty,
} from '@/lib/db/types';

const EVENT_TYPES: SafetyEventType[] = [
  'off_route', 'stopped_too_long', 'gps_silence', 'wrong_direction', 'speed_extreme',
  'check_in_alert', 'distress_admin', 'distress_911', 'distress_contact', 'ignored_streak',
];
const SEVERITIES: SafetyEventSeverity[] = ['info', 'warn', 'high', 'critical'];
const PARTIES: SafetyParty[] = ['rider', 'driver', 'system'];
const CHECK_PARTIES: SafetyCheckParty[] = ['rider', 'driver'];
const TRIGGERS: SafetyCheckTrigger[] = ['scheduled', 'anomaly_followup', 'manual_admin'];
const DISTRESS_KINDS = ['admin', '911', 'contact'] as const;
type DistressKind = (typeof DISTRESS_KINDS)[number];

function allow<T extends string>(val: unknown, allowed: readonly T[]): T | null {
  return typeof val === 'string' && (allowed as readonly string[]).includes(val) ? (val as T) : null;
}

function distressToType(k: DistressKind): SafetyEventType {
  return k === '911' ? 'distress_911' : k === 'contact' ? 'distress_contact' : 'distress_admin';
}
function distressToSeverity(k: DistressKind): SafetyEventSeverity {
  return k === '911' ? 'critical' : k === 'admin' ? 'high' : 'warn';
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const q = (params.get('q') ?? '').trim().slice(0, 80);
  const qLike = q ? `%${q}%` : null;
  const qPrefix = q ? `${q}%` : null;
  const marketId = (params.get('market_id') ?? '').trim() || null;

  // Show in-progress rides first (those are the useful ones to test against),
  // then everything else by recency. Market-scoped when the admin has a
  // market selected.
  const rows = (await sql`
    SELECT
      r.id, r.status, r.created_at,
      rp.display_name AS rider_name, dp.display_name AS driver_name
    FROM rides r
    LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    WHERE (
      ${qLike}::text IS NULL
      OR rp.display_name ILIKE ${qLike}
      OR dp.display_name ILIKE ${qLike}
      OR r.id::text LIKE ${qPrefix}
    )
      AND (${marketId}::uuid IS NULL OR r.market_id = ${marketId}::uuid)
    ORDER BY
      CASE WHEN r.status = 'in_progress' THEN 0 ELSE 1 END,
      r.created_at DESC
    LIMIT 20
  `) as Array<{
    id: string; status: string; created_at: string;
    rider_name: string | null; driver_name: string | null;
  }>;

  return NextResponse.json({ rides: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'bad_body' }, { status: 400 });

  const mode = body.mode;
  const rideId = typeof body.rideId === 'string' ? body.rideId : null;
  if (!rideId) return NextResponse.json({ error: 'rideId required' }, { status: 400 });

  // Confirm ride exists so we don't publish to a phantom channel.
  const rideRows = (await sql`
    SELECT id, rider_id, driver_id, status FROM rides WHERE id = ${rideId} LIMIT 1
  `) as Array<{ id: string; rider_id: string; driver_id: string; status: string }>;
  const ride = rideRows[0];
  if (!ride) return NextResponse.json({ error: 'ride_not_found' }, { status: 404 });

  if (mode === 'prompt') return handlePrompt(body, ride, admin.id);
  if (mode === 'event')  return handleEvent(body, ride, admin.id);
  if (mode === 'distress') return handleDistress(body, ride, admin.id);
  return NextResponse.json({ error: 'bad_mode' }, { status: 400 });
}

async function handlePrompt(
  body: Record<string, unknown>,
  ride: { id: string; rider_id: string; driver_id: string },
  adminId: string,
) {
  const party = allow(body.party, CHECK_PARTIES);
  if (!party) return NextResponse.json({ error: 'party required (rider|driver)' }, { status: 400 });
  const trigger = allow(body.trigger, TRIGGERS) ?? 'manual_admin';
  const cfg = await getPlatformSafetyConfig();
  const autoDismiss = typeof body.autoDismissSeconds === 'number'
    ? Math.max(10, Math.min(300, body.autoDismissSeconds))
    : cfg.prompt_auto_dismiss_seconds;

  const targetUserId = party === 'rider' ? ride.rider_id : ride.driver_id;

  const rows = (await sql`
    INSERT INTO ride_safety_checks (ride_id, user_id, party, trigger)
    VALUES (${ride.id}, ${targetUserId}, ${party}, ${trigger})
    RETURNING id, sent_at
  `) as Array<{ id: string; sent_at: Date }>;
  const checkId = rows[0].id;

  await publishRideUpdate(ride.id, 'safety_check_prompt', {
    checkId, party, trigger, autoDismissSeconds: autoDismiss, sentAt: rows[0].sent_at,
    source: 'admin_test',
  });
  await publishAdminEvent('safety_check_sent', {
    rideId: ride.id, checkId, party, trigger, sentAt: rows[0].sent_at, source: 'admin_test',
  });

  await logAdminAction(adminId, 'safety_test_prompt', 'ride', ride.id, { party, trigger, checkId });
  return NextResponse.json({ ok: true, mode: 'prompt', checkId, party, trigger });
}

async function handleEvent(
  body: Record<string, unknown>,
  ride: { id: string; rider_id: string; driver_id: string },
  adminId: string,
) {
  const eventType = allow(body.eventType, EVENT_TYPES);
  const severity = allow(body.severity, SEVERITIES) ?? 'warn';
  const party = allow(body.party, PARTIES) ?? 'system';
  if (!eventType) return NextResponse.json({ error: 'eventType required' }, { status: 400 });

  const lat = typeof body.locationLat === 'number' && isFinite(body.locationLat) ? body.locationLat : null;
  const lng = typeof body.locationLng === 'number' && isFinite(body.locationLng) ? body.locationLng : null;

  const triggeredBy = party === 'rider' ? ride.rider_id
    : party === 'driver' ? ride.driver_id
    : null;

  const rows = (await sql`
    INSERT INTO ride_safety_events (
      ride_id, event_type, severity, party, triggered_by_user_id,
      evidence, location_lat, location_lng
    ) VALUES (
      ${ride.id}, ${eventType}, ${severity}, ${party}, ${triggeredBy},
      ${JSON.stringify({ source: 'admin_test', fired_by: adminId })}::jsonb,
      ${lat}, ${lng}
    )
    RETURNING id, detected_at
  `) as Array<{ id: string; detected_at: Date }>;
  const eventId = rows[0].id;

  await publishAdminEvent('safety_alert', {
    rideId: ride.id, eventId, party, source: 'admin_test',
    reason: eventType, severity, lat, lng,
    at: rows[0].detected_at,
  });

  await logAdminAction(adminId, 'safety_test_event', 'ride', ride.id, {
    eventId, eventType, severity, party,
  });
  return NextResponse.json({ ok: true, mode: 'event', eventId, eventType, severity });
}

async function handleDistress(
  body: Record<string, unknown>,
  ride: { id: string; rider_id: string; driver_id: string },
  adminId: string,
) {
  const party = allow(body.party, CHECK_PARTIES);
  if (!party) return NextResponse.json({ error: 'party required (rider|driver)' }, { status: 400 });
  const kind = allow<DistressKind>(body.kind, DISTRESS_KINDS);
  if (!kind) return NextResponse.json({ error: 'kind required (admin|911|contact)' }, { status: 400 });

  const eventType = distressToType(kind);
  const severity = distressToSeverity(kind);
  const triggeredBy = party === 'rider' ? ride.rider_id : ride.driver_id;

  const rows = (await sql`
    INSERT INTO ride_safety_events (
      ride_id, event_type, severity, party, triggered_by_user_id,
      evidence, location_lat, location_lng
    ) VALUES (
      ${ride.id}, ${eventType}, ${severity}, ${party}, ${triggeredBy},
      ${JSON.stringify({ source: 'admin_test', kind, fired_by: adminId })}::jsonb,
      NULL, NULL
    )
    RETURNING id, detected_at
  `) as Array<{ id: string; detected_at: Date }>;
  const eventId = rows[0].id;

  await publishRideUpdate(ride.id, 'safety_distress', {
    eventId, party, kind, at: rows[0].detected_at, source: 'admin_test',
  });
  await publishAdminEvent('safety_alert', {
    rideId: ride.id, eventId, party, source: 'admin_test',
    distress: kind, severity, at: rows[0].detected_at,
  });

  await logAdminAction(adminId, 'safety_test_distress', 'ride', ride.id, { eventId, kind, party });
  return NextResponse.json({ ok: true, mode: 'distress', eventId, kind });
}
