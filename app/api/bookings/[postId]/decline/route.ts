import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { notifyUser } from '@/lib/ably/server';

/**
 * Driver passes on a post. Two branches:
 *
 * - `direct_booking` targeting this driver: flip to `declined_awaiting_rider`,
 *   clear target, stamp `last_declined_by`. Rider gets a "driver passed" card
 *   with Cancel / Broadcast actions. Tentative hold stays in place until the
 *   rider decides (timeout caller should release it).
 *
 * - `rider_request` (broadcast): insert a `ride_interests` row with
 *   status='passed' so the feed query excludes it for this driver. Post stays
 *   active for other drivers.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

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
    post_type: 'direct_booking' | 'rider_request' | 'driver_available';
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
        target_driver_id = NULL
      WHERE id = ${postId}
    `;

    const driverNameRows = await sql`SELECT handle FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1`;
    const driverName = (driverNameRows[0] as Record<string, unknown>)?.handle as string || 'The driver';

    notifyUser(post.user_id, 'booking_declined', {
      postId,
      driverName,
      message: `${driverName} passed — keep it private or broadcast to all drivers?`,
      awaitingRiderDecision: true,
    }).catch(() => {});

    return NextResponse.json({
      status: 'declined_awaiting_rider',
      postId,
      awaitingRiderDecision: true,
    });
  }

  if (post.post_type === 'rider_request') {
    // Broadcast pass — many drivers may pass independently, post stays active
    await sql`
      INSERT INTO ride_interests (post_id, driver_id, status)
      VALUES (${postId}, ${driverUserId}, 'passed')
      ON CONFLICT (post_id, driver_id) DO UPDATE SET status = 'passed'
    `;

    return NextResponse.json({ status: 'passed', postId });
  }

  return NextResponse.json({ error: 'This post type cannot be declined' }, { status: 400 });
}
