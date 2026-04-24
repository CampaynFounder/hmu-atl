import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { cancelTentativeBooking } from '@/lib/schedule/conflicts';
import { publishToChannel, notifyUser } from '@/lib/ably/server';
import { resolveMarketForUser, feedChannelForMarket } from '@/lib/markets/resolver';

/**
 * Rider closes out a direct booking that the target driver passed on.
 * Flips status to `cancelled` and releases the tentative calendar hold.
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
  const riderId = (userRows[0] as { id: string }).id;

  const result = await sql`
    UPDATE hmu_posts SET status = 'cancelled'
    WHERE id = ${postId}
      AND user_id = ${riderId}
      AND status = 'declined_awaiting_rider'
    RETURNING id, last_declined_by
  `;

  if (!result.length) {
    return NextResponse.json({ error: 'Nothing to cancel' }, { status: 404 });
  }

  const lastDeclinedBy = (result[0] as { last_declined_by: string | null }).last_declined_by;

  cancelTentativeBooking(postId).catch(() => {});

  // Realtime fan-out — every subscriber that was looking at this post needs
  // to know it's gone:
  //   1. market feed       → drivers seeing the locked preview drop the card
  //   2. rider's own notify → usePendingActions refetch clears driver_passed
  //                            within 1s instead of waiting for the 30s poll
  //   3. original driver's  → /driver/home + /driver/feed refetch so the
  //      notify              passed card / locked preview goes away even if
  //                          they aren't on the market-feed surface
  const market = await resolveMarketForUser(riderId);
  publishToChannel(feedChannelForMarket(market.slug), 'post_cancelled', { postId }).catch(() => {});
  notifyUser(riderId, 'post_cancelled', { postId, status: 'cancelled' }).catch(() => {});
  if (lastDeclinedBy) {
    notifyUser(lastDeclinedBy, 'post_cancelled', { postId, status: 'cancelled' }).catch(() => {});
  }

  return NextResponse.json({ status: 'cancelled', postId });
}
