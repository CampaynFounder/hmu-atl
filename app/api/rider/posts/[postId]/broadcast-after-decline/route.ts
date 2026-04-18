import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishToChannel } from '@/lib/ably/server';
import { resolveMarketForUser, feedChannelForMarket } from '@/lib/markets/resolver';
import { resolveProvidedSlugs } from '@/lib/markets/parse-areas';

/**
 * Rider converts a `declined_awaiting_rider` direct booking into a broadcast
 * `rider_request`. The original driver is recorded in `ride_interests` as
 * 'passed' so they don't see it in their feed.
 *
 * Optional body: `{ pickup_area_slug, dropoff_area_slug }` — rider can
 * broaden coverage at broadcast time (e.g. tap a cardinal like "northside"
 * instead of a single neighborhood).
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
      AND status = 'declined_awaiting_rider'
    LIMIT 1
  `;

  if (!postRows.length) {
    return NextResponse.json({ error: 'Nothing to broadcast' }, { status: 404 });
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

  // Exclude the driver who passed from the broadcast feed
  if (post.last_declined_by) {
    await sql`
      INSERT INTO ride_interests (post_id, driver_id, status)
      VALUES (${postId}, ${post.last_declined_by}, 'passed')
      ON CONFLICT (post_id, driver_id) DO UPDATE SET status = 'passed'
    `;
  }

  // Publish to the market feed so other drivers see it live
  const market = await resolveMarketForUser(riderId);
  const tw = post.time_window || {};
  publishToChannel(feedChannelForMarket(market.slug), 'rider_request', {
    postId,
    price: Number(post.price || 0),
    message: (tw as Record<string, unknown>).message || (tw as Record<string, unknown>).destination || '',
    pickup_area_slug: pickupSlug,
    dropoff_area_slug: dropoffSlug,
  }).catch(() => {});

  return NextResponse.json({
    status: 'broadcast',
    postId,
    pickup_area_slug: pickupSlug,
    dropoff_area_slug: dropoffSlug,
    dropoff_in_market: dropoffInMarket,
  });
}
