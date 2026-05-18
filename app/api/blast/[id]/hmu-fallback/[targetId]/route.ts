// POST /api/blast/[id]/hmu-fallback/[targetId]
// Rider taps HMU / swipes right on a driver card.
// Payment gate: rider must have a saved card (fraud prevention, no charge now).
// Sets notified_at and sends SMS + Ably push to that driver.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { fanoutBlast, type BlastTarget, type BlastNotificationContext } from '@/lib/blast/notify';
import { publishToChannel, notifyUser } from '@/lib/ably/server';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  // ── Payment gate ──
  // Rider must have a saved payment method before we contact any driver.
  // No charge at this stage — it's purely a fraud-prevention measure.
  const paymentRows = await sql`
    SELECT 1 FROM rider_payment_methods WHERE rider_id = ${riderId} LIMIT 1
  `;
  if (!paymentRows.length) {
    return NextResponse.json(
      { error: 'PAYMENT_REQUIRED', message: 'Link a card to contact drivers — no charge now, just fraud prevention' },
      { status: 412 },
    );
  }

  const blastRows = await sql`
    SELECT user_id, price, pickup_lat, pickup_lng, pickup_address,
           dropoff_lat, dropoff_lng, dropoff_address, scheduled_for, status,
           time_window->>'shortcode' AS shortcode
    FROM hmu_posts
    WHERE id = ${blastId} AND post_type = 'blast' LIMIT 1
  `;
  if (!blastRows.length) return NextResponse.json({ error: 'Blast not found' }, { status: 404 });
  const blast = blastRows[0] as Record<string, unknown>;

  if (blast.user_id !== riderId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (blast.status !== 'active') return NextResponse.json({ error: 'Blast is not active' }, { status: 400 });

  const targetRows = await sql`
    SELECT id, driver_id, match_score, notified_at,
           score_breakdown->>'distanceMi' AS distance_mi
    FROM blast_driver_targets
    WHERE id = ${targetId} AND blast_id = ${blastId}
    LIMIT 1
  `;
  if (!targetRows.length) return NextResponse.json({ error: 'Target not found' }, { status: 404 });
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

  const userCtxRows = await sql`
    SELECT display_name FROM users WHERE id = ${riderId} LIMIT 1
  `;
  const displayName = (userCtxRows[0] as { display_name: string | null } | undefined)?.display_name ?? 'A rider';

  const marketRows = await sql`
    SELECT m.slug FROM hmu_posts hp JOIN markets m ON m.id = hp.market_id
    WHERE hp.id = ${blastId} LIMIT 1
  `;
  const marketSlug = (marketRows[0] as { slug: string } | undefined)?.slug ?? 'atl';

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
    return hours < 12 ? `in ~${hours}h` : 'soon';
  };

  const pickupLat = Number(blast.pickup_lat);
  const pickupLng = Number(blast.pickup_lng);

  const blastTarget: BlastTarget = {
    targetId,
    driverId: target.driver_id,
    matchScore: Number(target.match_score),
    distanceMi: Number(target.distance_mi || 0),
  };

  const ctx: BlastNotificationContext = {
    blastId,
    riderDisplayName: displayName,
    pickupLabel: shortLabel(blast.pickup_address as string | undefined, pickupLat, pickupLng),
    dropoffLabel: shortLabel(blast.dropoff_address as string | undefined, Number(blast.dropoff_lat), Number(blast.dropoff_lng)),
    priceDollars: Number(blast.price),
    scheduledForLabel: whenLabel(blast.scheduled_for as Date | null),
    marketSlug,
    shortcode: (blast.shortcode as string) ?? '',
  };

  await sql`
    UPDATE blast_driver_targets SET notified_at = NOW() WHERE id = ${targetId}
  `;

  // ── Ably push — direct, like direct_booking_request (no gate dependencies) ──
  // fanoutBlast queries driver_blast_preferences which may not exist in all
  // envs; calling notifyUser directly here mirrors the direct booking pattern
  // and guarantees the driver's feed updates regardless of fanout state.
  await notifyUser(target.driver_id, 'blast_invite', {
    blastId,
    targetId,
    title: `New ride request — $${ctx.priceDollars}`,
    body: `${ctx.pickupLabel} → ${ctx.dropoffLabel} ${ctx.scheduledForLabel}`,
    url: `/driver/home?focus=${blastId}`,
  }).catch((err) => console.error('[hmu-fallback] push error:', err));

  // ── SMS via fanoutBlast (handles quiet hours, daily caps, kill switch) ──
  fanoutBlast([blastTarget], ctx).catch((err) =>
    console.error('[hmu-fallback] sms fanout error:', err),
  );

  // ── Rider's offer board — move this driver from fallback → targets ──
  publishToChannel(`blast:${blastId}`, 'target_notified', {
    targetId,
    driverId: target.driver_id,
    notifiedAt: new Date().toISOString(),
  }).catch((err) => console.error('[hmu-fallback] board event error:', err));

  return NextResponse.json({ ok: true });
}
