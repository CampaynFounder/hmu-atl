// POST /api/blast/[id]/impressions/beacon — driver client beacon for
// feed_impression / detail-view / deep-link-click / offer-page-view events.
// Per contract §8 + §9. Rate-limited 1/sec/driver to keep the funnel
// observable without flooding (per contract).
//
// File ownership note: contract §4 puts this endpoint in Stream D's column,
// but the Stream B handoff adds the writer here so blast_driver_events has a
// usable ingest before Stream D's admin page lands. Stream D's UI consumers
// will read these rows; this writer is contractually safe.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { writeBlastEvent } from '@/lib/blast/lifecycle';
import type { BlastEventType } from '@/lib/blast/types';

export const runtime = 'nodejs';

interface BeaconBody {
  source?: 'feed' | 'detail' | 'deep_link' | 'offer_page';
}

const SOURCE_TO_EVENT: Record<NonNullable<BeaconBody['source']>, BlastEventType> = {
  feed: 'feed_impression',
  detail: 'feed_impression', // detail-view is still an impression for funnel purposes
  deep_link: 'deep_link_clicked',
  offer_page: 'offer_page_viewed',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId } = await params;
  const body = (await req.json().catch(() => ({}))) as BeaconBody;
  const source = body.source ?? 'feed';
  const eventType = SOURCE_TO_EVENT[source] ?? 'feed_impression';

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverUserId = (userRows[0] as { id: string }).id;

  // 1/sec/driver per contract — beacons fire on scroll, easy to flood.
  const rl = await checkRateLimit({
    key: `blast:beacon:${driverUserId}`,
    limit: 1,
    windowSeconds: 1,
  });
  if (!rl.ok) {
    // Don't 429 the client — beacons are best-effort. Just no-op success so
    // the client doesn't retry storm.
    return NextResponse.json({ ok: true, throttled: true });
  }

  void writeBlastEvent({
    blastId,
    driverId: driverUserId,
    eventType,
    source: 'client_beacon',
    data: { source },
  });

  return NextResponse.json({ ok: true });
}
