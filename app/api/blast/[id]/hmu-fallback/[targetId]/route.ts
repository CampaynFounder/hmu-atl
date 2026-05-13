// POST /api/blast/[id]/hmu-fallback/[targetId] — rider manually triggers HMU for fallback driver
// Updates blast_driver_targets.notified_at and triggers SMS/push notification fanout

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { fanoutBlast, type BlastTarget, type BlastNotificationContext } from '@/lib/blast/notify';
import { publishToChannel } from '@/lib/ably/server';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;

  // Verify rider owns the blast
  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  const blastRows = await sql`
    SELECT user_id, price, pickup_lat, pickup_lng, pickup_address,
           dropoff_lat, dropoff_lng, dropoff_address, status
    FROM hmu_posts
    WHERE id = ${blastId} AND post_type = 'blast' LIMIT 1
  `;
  if (!blastRows.length) {
    return NextResponse.json({ error: 'Blast not found' }, { status: 404 });
  }
  const blast = blastRows[0] as Record<string, unknown>;

  if (blast.user_id !== riderId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (blast.status !== 'searching') {
    return NextResponse.json({ error: 'Blast is not in searching state' }, { status: 400 });
  }

  // Verify target exists and is a fallback driver (notified_at IS NULL)
  const targetRows = await sql`
    SELECT
      bdt.id, bdt.driver_id, bdt.match_score, bdt.notified_at,
      bdt.score_breakdown->>'distanceMi' AS distance_mi
    FROM blast_driver_targets bdt
    WHERE bdt.id = ${targetId} AND bdt.blast_id = ${blastId}
    LIMIT 1
  `;
  if (!targetRows.length) {
    return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  }
  const target = targetRows[0] as {
    id: string;
    driver_id: string;
    match_score: number;
    notified_at: Date | null;
    distance_mi: string;
  };

  if (target.notified_at !== null) {
    return NextResponse.json({ error: 'Driver already notified' }, { status: 400 });
  }

  // Get rider display name and blast shortcode for notification context
  const userCtxRows = await sql`
    SELECT u.display_name, hp.shortcode
    FROM users u
    JOIN hmu_posts hp ON hp.id = ${blastId}
    WHERE u.id = ${riderId}
    LIMIT 1
  `;
  const userCtx = userCtxRows[0] as { display_name: string | null; shortcode: string };

  // Get market slug
  const marketRows = await sql`
    SELECT m.slug
    FROM hmu_posts hp
    JOIN markets m ON m.id = hp.market_id
    WHERE hp.id = ${blastId}
    LIMIT 1
  `;
  const market = marketRows[0] as { slug: string };

  // Build notification context
  const pickupLat = Number(blast.pickup_lat);
  const pickupLng = Number(blast.pickup_lng);
  const dropoffLat = Number(blast.dropoff_lat);
  const dropoffLng = Number(blast.dropoff_lng);

  const shortLabel = (address: string | undefined, lat: number, lng: number): string => {
    if (address) {
      const seg = address.split(',')[0].trim();
      return seg.length > 24 ? seg.slice(0, 22) + '…' : seg;
    }
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
  };

  const whenLabel = (scheduledFor: Date | null): string => {
    if (!scheduledFor) return 'now';
    const minutes = Math.round((scheduledFor.getTime() - Date.now()) / 60_000);
    if (minutes <= 0) return 'now';
    if (minutes < 60) return `in ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 12) return `in ~${hours}h`;
    const local = new Date(scheduledFor.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (local.toDateString() === tomorrow.toDateString()) return 'tomorrow';
    return local.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const blastTarget: BlastTarget = {
    targetId,
    driverId: target.driver_id,
    matchScore: Number(target.match_score),
    distanceMi: Number(target.distance_mi || 0),
  };

  const ctx: BlastNotificationContext = {
    blastId,
    riderDisplayName: userCtx.display_name ?? 'A rider',
    pickupLabel: shortLabel(blast.pickup_address as string | undefined, pickupLat, pickupLng),
    dropoffLabel: shortLabel(blast.dropoff_address as string | undefined, dropoffLat, dropoffLng),
    priceDollars: Number(blast.price),
    scheduledForLabel: whenLabel(blast.scheduled_for as Date | null),
    marketSlug: market.slug,
    shortcode: userCtx.shortcode,
  };

  // Update notified_at timestamp BEFORE fanout (fanout reads prefs and may skip, but we mark as "attempted")
  await sql`
    UPDATE blast_driver_targets
    SET notified_at = NOW()
    WHERE id = ${targetId}
  `;

  // Trigger SMS/push notification fanout for this single driver
  try {
    await fanoutBlast([blastTarget], ctx);
  } catch (err) {
    console.error('Fanout error for fallback driver:', err);
    // Non-fatal — DB updated, notification just failed
  }

  // Publish Ably event to update offer board in real-time
  try {
    await publishToChannel(`blast:${blastId}`, 'target.notified', {
      targetId,
      driverId: target.driver_id,
      notifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Ably publish error:', err);
    // Non-fatal
  }

  return NextResponse.json({ success: true });
}
