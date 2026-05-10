import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishToChannel, notifyUser } from '@/lib/ably/server';
import { resolveMarketForUser, feedChannelForMarket } from '@/lib/markets/resolver';
import { resolveProvidedSlugs } from '@/lib/markets/parse-areas';

/**
 * Rider re-broadcasts a post into `rider_request` to keep looking for
 * a driver. Two acceptable starting states:
 *   - 'declined_awaiting_rider' — direct booking the target driver passed on
 *   - 'cancelled'               — matched ride that subsequently cancelled
 *                                 (cascadeRideCancel sets the post to
 *                                 'cancelled' by default; rider can opt-in
 *                                 here to keep looking)
 *
 * The driver who was previously matched / declined is recorded in
 * `ride_interests` as 'passed' so they don't see this re-broadcast.
 *
 * Optional body: `{ pickup_area_slug, dropoff_area_slug }` — rider can
 * broaden coverage at broadcast time.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  const body = await req.json().catch(() => ({})) as {
    pickup_area_slug?: string | null;
    dropoff_area_slug?: string | null;
  };

  const postRows = await sql`
    SELECT id, last_declined_by, price, time_window, market_id,
           pickup_area_slug, dropoff_area_slug, dropoff_in_market
    FROM hmu_posts
    WHERE id = ${postId}
      AND user_id = ${riderId}
      AND status IN ('declined_awaiting_rider', 'cancelled')
    LIMIT 1
  `;

  if (!postRows.length) {
    return NextResponse.json({ error: 'Nothing to broadcast' }, { status: 404 });
  }

  // For cancelled-state posts, last_declined_by may be null. We still want
  // to mark the originally-matched driver (from the cancelled ride) as
  // 'passed' so the re-broadcast doesn't re-notify them — pull it from
  // the most recent ride that referenced this post.
  let originallyMatchedDriverId: string | null =
    (postRows[0] as { last_declined_by: string | null }).last_declined_by;
  if (!originallyMatchedDriverId) {
    const matchedRows = (await sql`
      SELECT driver_id FROM rides
      WHERE hmu_post_id = ${postId} AND driver_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `) as Array<{ driver_id: string | null }>;
    originallyMatchedDriverId = matchedRows[0]?.driver_id ?? null;
  }

  const post = postRows[0] as {
    id: string;
    last_declined_by: string | null;
    price: number;
    time_window: Record<string, unknown>;
    market_id: string;
    pickup_area_slug: string | null;
    dropoff_area_slug: string | null;
    dropoff_in_market: boolean;
  };

  // Allow rider to widen coverage at broadcast time
  let pickupSlug = post.pickup_area_slug;
  let dropoffSlug = post.dropoff_area_slug;
  let dropoffInMarket = post.dropoff_in_market;

  if (body.pickup_area_slug || body.dropoff_area_slug) {
    const route = await resolveProvidedSlugs(
      post.market_id,
      body.pickup_area_slug ?? post.pickup_area_slug,
      body.dropoff_area_slug ?? post.dropoff_area_slug,
    );
    pickupSlug = route.pickup_area_slug;
    dropoffSlug = route.dropoff_area_slug;
    dropoffInMarket = route.dropoff_in_market;
  }

  await sql`
    UPDATE hmu_posts SET
      post_type = 'rider_request',
      status = 'active',
      expires_at = NOW() + INTERVAL '2 hours',
      booking_expires_at = NULL,
      pickup_area_slug = ${pickupSlug},
      dropoff_area_slug = ${dropoffSlug},
      dropoff_in_market = ${dropoffInMarket}
    WHERE id = ${postId}
  `;

  // Exclude the original driver from the broadcast feed (covers both
  // declined-direct and cancelled-after-match cases — see lookup above).
  if (originallyMatchedDriverId) {
    await sql`
      INSERT INTO ride_interests (post_id, driver_id, status)
      VALUES (${postId}, ${originallyMatchedDriverId}, 'passed')
      ON CONFLICT (post_id, driver_id) DO UPDATE SET status = 'passed'
    `;
  }

  // Realtime fan-out — same principle as cancel-after-decline. Subscribers
  // need to know the post moved from declined_awaiting_rider to active
  // rider_request so their UI re-syncs.
  const market = await resolveMarketForUser(riderId);
  const tw = post.time_window || {};
  publishToChannel(feedChannelForMarket(market.slug), 'rider_request', {
    postId,
    price: Number(post.price || 0),
    message: (tw as Record<string, unknown>).message || (tw as Record<string, unknown>).destination || '',
    pickup_area_slug: pickupSlug,
    dropoff_area_slug: dropoffSlug,
  }).catch(() => {});
  // Rider notify → pending-actions refetch drops the driver_passed banner
  // and (eventually) surfaces the active broadcast state.
  notifyUser(riderId, 'post_broadcast', { postId, status: 'active' }).catch(() => {});
  // Notify the original driver so any stale ride-related card clears
  // across surfaces. Same identity used in the 'passed' insertion above.
  if (originallyMatchedDriverId) {
    notifyUser(originallyMatchedDriverId, 'post_broadcast', { postId, status: 'active' }).catch(() => {});
  }

  return NextResponse.json({
    status: 'broadcast',
    postId,
    pickup_area_slug: pickupSlug,
    dropoff_area_slug: dropoffSlug,
    dropoff_in_market: dropoffInMarket,
  });
}
