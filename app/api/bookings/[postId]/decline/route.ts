import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { notifyUser, publishToChannel } from '@/lib/ably/server';
import { resolveMarketForUser, feedChannelForMarket } from '@/lib/markets/resolver';

/**
 * Driver passes on a post. Two branches:
 *
 * - `direct_booking` targeting this driver: flip to `declined_awaiting_rider`,
 *   clear target, stamp `last_declined_by`, persist pass_reason / pass_message.
 *   Rider gets a "driver passed" card with Cancel / Broadcast actions. Tentative
 *   hold stays in place until the rider decides (timeout caller should release
 *   it).
 *
 * - `rider_request` (broadcast): insert / upsert a `ride_interests` row with
 *   status='passed' plus reason/message so the feed query excludes it for
 *   this driver. Post stays active for other drivers. Rider is NOT notified
 *   per-pass on broadcast flows (would be noisy; see backlog for targeting).
 *
 * Body (all optional):
 *   reason  — 'price' | 'distance' | 'booked' | 'other'
 *   message — ≤140 chars free text
 */

const ALLOWED_REASONS = new Set(['price', 'distance', 'booked', 'other']);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

  const body = (await req.json().catch(() => ({}))) as { reason?: string; message?: string };
  const reason = typeof body.reason === 'string' && ALLOWED_REASONS.has(body.reason) ? body.reason : null;
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 140) : '';
  const messageOrNull = message.length > 0 ? message : null;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverUserId = (userRows[0] as { id: string }).id;

  const postRows = await sql`
    SELECT id, user_id, post_type, target_driver_id, status, price, time_window
    FROM hmu_posts
    WHERE id = ${postId} AND status = 'active'
    LIMIT 1
  `;
  if (!postRows.length) {
    return NextResponse.json({ error: 'Booking not found or already closed' }, { status: 404 });
  }

  const post = postRows[0] as {
    id: string;
    user_id: string;
    post_type: 'direct_booking' | 'rider_request' | 'driver_available' | 'blast';
    target_driver_id: string | null;
    status: string;
    price: number;
    time_window: Record<string, unknown>;
  };

  if (post.post_type === 'direct_booking') {
    if (post.target_driver_id !== driverUserId) {
      return NextResponse.json({ error: 'Not your booking to pass on' }, { status: 403 });
    }

    await sql`
      UPDATE hmu_posts SET
        status = 'declined_awaiting_rider',
        last_declined_by = ${driverUserId},
        last_declined_reason = ${reason},
        last_declined_message = ${messageOrNull},
        target_driver_id = NULL
      WHERE id = ${postId}
    `;

    const driverNameRows = await sql`SELECT handle FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1`;
    const driverName = (driverNameRows[0] as Record<string, unknown>)?.handle as string || 'The driver';

    notifyUser(post.user_id, 'booking_declined', {
      postId,
      driverName,
      price: Number(post.price || 0),
      reason,          // 'price' | 'distance' | 'booked' | 'other' | null
      message: messageOrNull,
      // Kept for backwards-compatibility with clients that still read `message`
      // as the UI copy. New clients should prefer `driverMessage` above.
      copy: `${driverName} passed — keep it private or broadcast to all drivers?`,
      awaitingRiderDecision: true,
    }).catch(() => {});

    // Surface the locked preview to other drivers in the market right away
    // so they see the demand and can pounce the moment the rider broadcasts.
    const market = await resolveMarketForUser(post.user_id);
    publishToChannel(feedChannelForMarket(market.slug), 'post_locked', { postId }).catch(() => {});
    // Also ping the passing driver's own notify so any other surface they
    // have open (driver-home in another tab, /driver/feed mid-stack) drops
    // the card without waiting for the next visibility-change refetch.
    notifyUser(driverUserId, 'pass_committed', { postId }).catch(() => {});

    return NextResponse.json({
      status: 'declined_awaiting_rider',
      postId,
      awaitingRiderDecision: true,
    });
  }

  if (post.post_type === 'blast') {
    // Silent pass — rider isn't notified on individual driver passes (would
    // be noisy). Stamp passed_at so the offer board can hide them and matching
    // can dedupe future blasts from the same rider.
    await sql`
      UPDATE blast_driver_targets
         SET passed_at = NOW()
       WHERE blast_id = ${postId}
         AND driver_id = ${driverUserId}
         AND passed_at IS NULL
         AND hmu_at IS NULL
    `;
    notifyUser(driverUserId, 'pass_committed', { postId }).catch(() => {});
    return NextResponse.json({ status: 'passed', postId, blast: true });
  }

  if (post.post_type === 'rider_request') {
    // Broadcast pass — many drivers may pass independently, post stays active.
    // Reason + message stored for analytics and future targeting (see backlog).
    await sql`
      INSERT INTO ride_interests (post_id, driver_id, status, pass_reason, pass_message)
      VALUES (${postId}, ${driverUserId}, 'passed', ${reason}, ${messageOrNull})
      ON CONFLICT (post_id, driver_id) DO UPDATE SET
        status = 'passed',
        pass_reason = ${reason},
        pass_message = ${messageOrNull},
        updated_at = NOW()
    `;
    // Cross-surface sync for the passing driver only — other drivers are
    // unaffected since the broadcast post stays active for them.
    notifyUser(driverUserId, 'pass_committed', { postId }).catch(() => {});

    return NextResponse.json({ status: 'passed', postId });
  }

  return NextResponse.json({ error: 'This post type cannot be declined' }, { status: 400 });
}
