// POST /api/blast/[id]/hmu/[targetId]
// Rider swipes right on a targeted driver — sends them an HMU notification
// so they can respond. The rider must own this blast. Uses the existing
// notifyUser (Ably) utility so the driver sees it in their live feed.
// The first driver to accept via /api/bookings/[postId]/accept wins; the
// blast deck auto-calls /api/blast/[id]/select/[targetId] on their response.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { notifyUser } from '@/lib/ably/server';
import { markBlastTargetNotified } from '@/lib/blast/notify-target';
import { notifyDriverBlastHmu } from '@/lib/sms/textbee';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;

  // Verify rider owns this blast and it's still active
  const blastRows = await sql`
    SELECT p.id, p.price, p.time_window, p.expires_at,
           p.pickup_address, p.dropoff_address, u.id AS rider_id
    FROM hmu_posts p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${blastId}
      AND u.clerk_id = ${clerkId}
      AND p.post_type IN ('blast', 'rider_request')
      AND p.status = 'active'
      AND p.expires_at > NOW()
    LIMIT 1
  `;
  if (!blastRows.length) {
    return NextResponse.json({ error: 'Blast not found or expired' }, { status: 404 });
  }
  const blast = blastRows[0] as {
    id: string; price: number; time_window: Record<string, unknown>;
    expires_at: string; pickup_address: string | null;
    dropoff_address: string | null; rider_id: string;
  };

  // Verify this driver is a target of this blast
  const targetRows = await sql`
    SELECT bdt.driver_id, bdt.hmu_at, bdt.passed_at, bdt.notified_at,
           dp.handle, u.phone
    FROM blast_driver_targets bdt
    JOIN driver_profiles dp ON dp.user_id = bdt.driver_id
    JOIN users u ON u.id = bdt.driver_id
    WHERE bdt.id = ${targetId}
      AND bdt.blast_id = ${blastId}
    LIMIT 1
  `;
  if (!targetRows.length) {
    return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  }
  const target = targetRows[0] as {
    driver_id: string; hmu_at: string | null; passed_at: string | null;
    notified_at: string | null; handle: string; phone: string | null;
  };

  // Already matched or passed — idempotent 200
  if (target.hmu_at) return NextResponse.json({ ok: true, alreadyResponded: true });

  // Re-tap guard — mirror /hmu-fallback: once this driver is notified, a second
  // swipe must not re-stamp notified_at or re-fire the push/SMS. markBlastTargetNotified
  // is itself idempotent on the column, but bailing here also stops the
  // duplicate blast_rider_hmu ping + textbee SMS below.
  if (target.notified_at) {
    return NextResponse.json({ error: 'Driver already notified' }, { status: 400 });
  }

  const tw = blast.time_window ?? {};
  const pickup = typeof tw.pickup === 'object' && tw.pickup !== null
    ? (tw.pickup as Record<string, unknown>)
    : {};

  // ── Visibility contract: stamp notified_at + fire blast_invite ──
  // WITHOUT this the card never appears in the driver feed (the feed query
  // hard-filters on notified_at IS NOT NULL). Mirrors hmu-fallback exactly —
  // both routes funnel through the same helper so they can't drift again.
  const dbPickupLabel = (blast.pickup_address as string | null)?.split(',')[0]?.trim()
    || (pickup.short_label as string | undefined)
    || (pickup.address as string | undefined)
    || 'Pickup';
  const dbDropoffLabel = (blast.dropoff_address as string | null)?.split(',')[0]?.trim() || 'Dropoff';
  await markBlastTargetNotified({
    blastId,
    targetId,
    driverId: target.driver_id,
    priceDollars: Number(blast.price),
    pickupLabel: dbPickupLabel,
    dropoffLabel: dbDropoffLabel,
  });

  // Notify driver via Ably (shows as live toast in their feed)
  await notifyUser(target.driver_id, 'blast_rider_hmu', {
    blastId,
    targetId,
    price: blast.price,
    pickupAddress: pickup.address ?? 'See app',
    expiresAt: blast.expires_at,
  });

  // SMS — confirm rider specifically chose this driver.
  // Must be awaited: Cloudflare Workers terminate unawaited promises the moment
  // the response is sent, so fire-and-forget means the VoIP.ms call never fires.
  if (target.phone) {
    const pickupLabel = (pickup.short_label as string | undefined) ?? (pickup.address as string | undefined) ?? 'Pickup';
    const dropoffTw = typeof (blast.time_window as Record<string, unknown>)?.dropoff === 'object'
      ? (blast.time_window as Record<string, unknown>).dropoff as Record<string, unknown>
      : {};
    const dropoffLabel = (dropoffTw.short_label as string | undefined) ?? (dropoffTw.address as string | undefined) ?? 'Dropoff';
    const viewerCount = Math.floor(Math.random() * 11) + 5;
    await notifyDriverBlastHmu(target.phone, {
      price: Number(blast.price),
      pickup: pickupLabel,
      dropoff: dropoffLabel,
      viewerCount,
    }, { userId: target.driver_id }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
