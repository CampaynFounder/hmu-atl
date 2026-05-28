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
    SELECT p.id, p.price, p.time_window, p.expires_at, u.id AS rider_id
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
    expires_at: string; rider_id: string;
  };

  // Verify this driver is a target of this blast
  const targetRows = await sql`
    SELECT bdt.driver_id, bdt.hmu_at, bdt.passed_at,
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
    handle: string; phone: string | null;
  };

  // Already matched or passed — idempotent 200
  if (target.hmu_at) return NextResponse.json({ ok: true, alreadyResponded: true });

  const tw = blast.time_window ?? {};
  const pickup = typeof tw.pickup === 'object' && tw.pickup !== null
    ? (tw.pickup as Record<string, unknown>)
    : {};

  // Notify driver via Ably (shows as live toast in their feed)
  await notifyUser(target.driver_id, 'blast_rider_hmu', {
    blastId,
    targetId,
    price: blast.price,
    pickupAddress: pickup.address ?? 'See app',
    expiresAt: blast.expires_at,
  });

  return NextResponse.json({ ok: true });
}
