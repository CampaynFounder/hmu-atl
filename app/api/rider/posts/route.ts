import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishToChannel, publishAdminEvent } from '@/lib/ably/server';
import { resolveMarketForUser, feedChannelForMarket } from '@/lib/markets/resolver';
import { parseRoute, resolveProvidedSlugs } from '@/lib/markets/parse-areas';
import { globalDefaultAllowsCashOnly } from '@/lib/payments/strategies';

// GET — list rider's active posts
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Auto-expire stale posts before fetching
    await sql`
      UPDATE hmu_posts SET status = 'expired'
      WHERE user_id = ${userId}
        AND post_type IN ('rider_request', 'direct_booking')
        AND status = 'active'
        AND (expires_at < NOW() OR booking_expires_at < NOW())
    `;

    // Sync orphaned posts — matched posts whose ride is done
    await sql`
      UPDATE hmu_posts SET status = 'completed'
      WHERE user_id = ${userId}
        AND status = 'matched'
        AND id IN (
          SELECT hmu_post_id FROM rides
          WHERE hmu_post_id IS NOT NULL
            AND status IN ('completed', 'ended', 'cancelled', 'refunded')
        )
    `.catch(() => {});

    const rows = await sql`
      SELECT p.id, p.areas, p.price, p.time_window, p.status, p.post_type,
             p.created_at, p.booking_expires_at, p.is_cash,
             dp.display_name as driver_name, dp.handle as driver_handle
      FROM hmu_posts p
      LEFT JOIN driver_profiles dp ON dp.user_id = p.target_driver_id
      WHERE p.user_id = ${userId}
        AND p.post_type IN ('rider_request', 'direct_booking')
      ORDER BY p.created_at DESC
      LIMIT 30
    `;

    const posts = rows.map((r: Record<string, unknown>) => {
      const tw = (r.time_window ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        type: r.post_type === 'direct_booking' ? 'direct' : 'open',
        message: tw.message || tw.destination || '',
        price: Number(r.price ?? 0),
        status: r.status,
        driverName: (r.driver_name as string) || null,
        driverHandle: (r.driver_handle as string) || null,
        isCash: (r.is_cash as boolean) || false,
        expiresAt: (r.booking_expires_at as string) || null,
        createdAt: r.created_at,
      };
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Get rider posts error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — create a new ride request post
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { message, price, is_cash, pickup_area_slug, dropoff_area_slug } = await req.json();

    if (!message || !price || price < 1) {
      return NextResponse.json({ error: 'Include a message and price ($1 minimum)' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Block only if a ride is in progress right now. A future 'matched'
    // booking shouldn't stop the rider from broadcasting a different-time
    // request.
    const activeRides = await sql`SELECT id FROM rides WHERE rider_id = ${userId} AND status IN ('otw','here','active') LIMIT 1`;
    if (activeRides.length) {
      return NextResponse.json({ error: 'You already have an active ride', code: 'active_ride', rideId: (activeRides[0] as { id: string }).id }, { status: 409 });
    }

    const market = await resolveMarketForUser(userId);

    // Prefer explicit client-selected slugs (confirm chips). Fall back to
    // natural-language parse of the free-text message.
    const route = (pickup_area_slug || dropoff_area_slug)
      ? await resolveProvidedSlugs(market.market_id, pickup_area_slug, dropoff_area_slug)
      : await parseRoute(message, market.market_id);

    // Active pricing mode gets the final say. When deposit_only is the global
    // default, every ride must authorize a digital deposit — the legacy
    // is_cash post option is forced off so the COO/booking flow can't take
    // the cash short-circuit.
    const cashAllowed = await globalDefaultAllowsCashOnly();
    const resolvedIsCash = cashAllowed ? Boolean(is_cash) : false;

    const rows = await sql`
      INSERT INTO hmu_posts (
        user_id, post_type, market_id, pickup_area_slug, dropoff_area_slug, dropoff_in_market,
        areas, price, time_window, status, expires_at, is_cash
      ) VALUES (
        ${userId}, 'rider_request', ${market.market_id},
        ${route.pickup_area_slug}, ${route.dropoff_area_slug}, ${route.dropoff_in_market},
        ${[market.slug.toUpperCase()]},
        ${price}, ${JSON.stringify({ message, destination: message })}::jsonb,
        'active', NOW() + INTERVAL '2 hours', ${resolvedIsCash}
      )
      RETURNING id
    `;

    const postId = (rows[0] as { id: string }).id;

    // Publish to market feed so driver feeds update in real-time
    publishToChannel(feedChannelForMarket(market.slug), 'rider_request', {
      postId, price, message,
      pickup_area_slug: route.pickup_area_slug,
      dropoff_area_slug: route.dropoff_area_slug,
    }).catch(() => {});

    // Mirror to admin:feed so super-admin banner notifications can light up.
    publishAdminEvent('rider_request', {
      postId, price, message, market: market.slug,
      pickup_area_slug: route.pickup_area_slug,
      dropoff_area_slug: route.dropoff_area_slug,
    }).catch(() => {});

    return NextResponse.json({
      postId,
      market: market.slug,
      pickup_area_slug: route.pickup_area_slug,
      dropoff_area_slug: route.dropoff_area_slug,
      dropoff_in_market: route.dropoff_in_market,
    }, { status: 201 });
  } catch (error) {
    console.error('Create rider post error:', error);
    return NextResponse.json({ error: 'Failed to post' }, { status: 500 });
  }
}

// DELETE — cancel a ride request
export async function DELETE(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const postId = req.nextUrl.searchParams.get('postId');
    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Get driver ID before cancelling (for notification)
    const postRows = await sql`
      SELECT target_driver_id FROM hmu_posts
      WHERE id = ${postId} AND user_id = ${userId} AND status = 'active'
      LIMIT 1
    `;

    await sql`
      UPDATE hmu_posts SET status = 'cancelled'
      WHERE id = ${postId} AND user_id = ${userId} AND status = 'active'
    `;

    // Release any tentative calendar hold for this booking
    const { cancelTentativeBooking } = await import('@/lib/schedule/conflicts');
    cancelTentativeBooking(postId).catch(() => {});

    // Notify driver that rider cancelled
    if (postRows.length) {
      const driverId = (postRows[0] as Record<string, unknown>).target_driver_id as string;
      if (driverId) {
        const { notifyUser } = await import('@/lib/ably/server');
        notifyUser(driverId, 'booking_cancelled', { postId }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete rider post error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
