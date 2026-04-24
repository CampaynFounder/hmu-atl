import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, publishAdminEvent } from '@/lib/ably/server';
import { checkRateLimit } from '@/lib/rate-limit/check';
import type { SafetyCheckResponse, SafetyEventType, SafetyEventSeverity } from '@/lib/db/types';

interface Body {
  checkId: string;
  response: SafetyCheckResponse;
  lat?: number;
  lng?: number;
  distress?: 'admin' | '911' | 'contact';
}

const ALLOWED_RESPONSES: SafetyCheckResponse[] = ['ok', 'alert', 'ignored'];

function distressToEventType(d: NonNullable<Body['distress']>): SafetyEventType {
  return d === '911' ? 'distress_911' : d === 'contact' ? 'distress_contact' : 'distress_admin';
}
function distressToSeverity(d: NonNullable<Body['distress']>): SafetyEventSeverity {
  return d === '911' ? 'critical' : 'high';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rl = await checkRateLimit({
    key: `safety-respond:${clerkId}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited', retryAfter: rl.retryAfterSeconds }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !body.checkId || !ALLOWED_RESPONSES.includes(body.response)) {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  // Load user + verify they're a party on this ride AND own this check
  const userRows = (await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `) as Array<{ id: string }>;
  const userId = userRows[0]?.id;
  if (!userId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const checkRows = (await sql`
    SELECT c.id, c.party, c.response, c.user_id, r.rider_id, r.driver_id
    FROM ride_safety_checks c
    INNER JOIN rides r ON r.id = c.ride_id
    WHERE c.id = ${body.checkId} AND c.ride_id = ${rideId}
    LIMIT 1
  `) as Array<{
    id: string;
    party: 'rider' | 'driver';
    response: SafetyCheckResponse | null;
    user_id: string;
    rider_id: string;
    driver_id: string;
  }>;
  const check = checkRows[0];
  if (!check) return NextResponse.json({ error: 'check_not_found' }, { status: 404 });
  if (check.user_id !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (check.response) {
    // Idempotent — already responded. Treat as success to avoid retries clobbering state.
    return NextResponse.json({ ok: true, already: true });
  }

  const lat = typeof body.lat === 'number' && isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && isFinite(body.lng) ? body.lng : null;

  // If the user flagged an alert, create the safety event first so we can
  // back-link the check → event. High-severity events also go to admin:feed.
  let eventId: string | null = null;
  if (body.response === 'alert') {
    const evtType: SafetyEventType = body.distress ? distressToEventType(body.distress) : 'check_in_alert';
    const evtSeverity: SafetyEventSeverity = body.distress ? distressToSeverity(body.distress) : 'high';
    const evt = (await sql`
      INSERT INTO ride_safety_events (
        ride_id, event_type, severity, party, triggered_by_user_id,
        evidence, location_lat, location_lng
      ) VALUES (
        ${rideId}, ${evtType}, ${evtSeverity}, ${check.party}, ${userId},
        ${JSON.stringify({ check_id: check.id, distress: body.distress ?? null })}::jsonb,
        ${lat}, ${lng}
      )
      RETURNING id
    `) as Array<{ id: string }>;
    eventId = evt[0].id;
  }

  await sql`
    UPDATE ride_safety_checks SET
      responded_at = NOW(),
      response = ${body.response},
      location_lat = ${lat},
      location_lng = ${lng},
      related_event_id = ${eventId}
    WHERE id = ${check.id}
  `;

  // Publish to ride channel so the counterparty sees "your rider said all good" indicator.
  await publishRideUpdate(rideId, 'safety_check_response', {
    checkId: check.id,
    party: check.party,
    response: body.response,
    eventId,
    at: new Date().toISOString(),
  });

  // Admin visibility — every alert lands on the admin feed. 'ok' and 'ignored'
  // don't (ignored-streak detection runs server-side and emits its own event).
  if (body.response === 'alert') {
    await publishAdminEvent('safety_alert', {
      rideId,
      checkId: check.id,
      eventId,
      party: check.party,
      userId,
      distress: body.distress ?? null,
      lat, lng,
      severity: body.distress ? distressToSeverity(body.distress) : 'high',
      at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, eventId });
}
