import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, publishAdminEvent } from '@/lib/ably/server';
import { checkRateLimit } from '@/lib/rate-limit/check';
import type { SafetyEventType, SafetyEventSeverity, SafetyParty } from '@/lib/db/types';

interface Body {
  kind: 'admin' | '911' | 'contact';
  lat?: number;
  lng?: number;
}

const KIND_TO_TYPE: Record<Body['kind'], SafetyEventType> = {
  admin: 'distress_admin',
  '911': 'distress_911',
  contact: 'distress_contact',
};
const KIND_TO_SEVERITY: Record<Body['kind'], SafetyEventSeverity> = {
  admin: 'high',
  '911': 'critical',
  contact: 'warn',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rideId } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Tighter rate limit than respond — this is the user-initiated path and can't
  // be spammed into the admin queue.
  const rl = await checkRateLimit({
    key: `safety-distress:${clerkId}`,
    limit: 5,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: 'rate_limited', retryAfter: rl.retryAfterSeconds }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !KIND_TO_TYPE[body.kind]) {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }

  const rows = (await sql`
    SELECT u.id AS user_id, r.rider_id, r.driver_id
    FROM users u, rides r
    WHERE u.clerk_id = ${clerkId} AND r.id = ${rideId}
    LIMIT 1
  `) as Array<{ user_id: string; rider_id: string; driver_id: string }>;
  const ctx = rows[0];
  if (!ctx) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const party: SafetyParty = ctx.user_id === ctx.rider_id ? 'rider'
    : ctx.user_id === ctx.driver_id ? 'driver' : 'system';
  if (party === 'system') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const lat = typeof body.lat === 'number' && isFinite(body.lat) ? body.lat : null;
  const lng = typeof body.lng === 'number' && isFinite(body.lng) ? body.lng : null;

  const eventType = KIND_TO_TYPE[body.kind];
  const severity = KIND_TO_SEVERITY[body.kind];

  const evt = (await sql`
    INSERT INTO ride_safety_events (
      ride_id, event_type, severity, party, triggered_by_user_id,
      evidence, location_lat, location_lng
    ) VALUES (
      ${rideId}, ${eventType}, ${severity}, ${party}, ${ctx.user_id},
      ${JSON.stringify({ source: 'distress_tile', kind: body.kind })}::jsonb,
      ${lat}, ${lng}
    )
    RETURNING id, detected_at
  `) as Array<{ id: string; detected_at: Date }>;

  const eventId = evt[0].id;

  await publishRideUpdate(rideId, 'safety_distress', {
    eventId, party, kind: body.kind, at: evt[0].detected_at,
  });

  await publishAdminEvent('safety_alert', {
    rideId,
    eventId,
    party,
    userId: ctx.user_id,
    distress: body.kind,
    lat, lng,
    severity,
    at: evt[0].detected_at,
  });

  return NextResponse.json({ ok: true, eventId });
}
