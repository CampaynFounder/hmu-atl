import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishToChannel, publishAdminEvent } from '@/lib/ably/server';
import { resolveMarketForUser, feedChannelForMarket } from '@/lib/markets/resolver';

// GET — list driver's active availability posts
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
        AND post_type = 'driver_available'
        AND status = 'active'
        AND expires_at < NOW()
    `;

    const rows = await sql`
      SELECT id, areas, price, time_window, status, created_at, expires_at
      FROM hmu_posts
      WHERE user_id = ${userId}
        AND post_type = 'driver_available'
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const posts = rows.map((r: Record<string, unknown>) => {
      const tw = (r.time_window ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        message: tw.message || '',
        price: Number(r.price ?? 0),
        areas: Array.isArray(r.areas) ? r.areas : [],
        status: r.status,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
      };
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Get driver posts error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST — create a new driver availability post
export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { message, price } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Say what you\'re offering (e.g. "$20 Rides on the Eastside HMU")' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const market = await resolveMarketForUser(userId);

    // Driver's slug-based coverage (new source of truth)
    const profileRows = await sql`
      SELECT area_slugs, services_entire_market, accepts_long_distance
      FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
    `;
    const driverProfile = (profileRows[0] || {}) as {
      area_slugs?: string[];
      services_entire_market?: boolean;
      accepts_long_distance?: boolean;
    };
    const driverAreas: string[] = Array.isArray(driverProfile.area_slugs) && driverProfile.area_slugs.length
      ? driverProfile.area_slugs
      : [market.slug.toUpperCase()];

    // Parse price from message if not provided
    let parsedPrice = price;
    if (!parsedPrice) {
      const priceMatch = message.match(/\$(\d+)/);
      parsedPrice = priceMatch ? parseInt(priceMatch[1]) : 0;
    }

    // Cancel any existing active posts by this driver
    await sql`
      UPDATE hmu_posts SET status = 'expired'
      WHERE user_id = ${userId} AND post_type = 'driver_available' AND status = 'active'
    `;

    const rows = await sql`
      INSERT INTO hmu_posts (
        user_id, post_type, market_id, areas, price, time_window, status, expires_at
      ) VALUES (
        ${userId}, 'driver_available', ${market.market_id}, ${driverAreas},
        ${parsedPrice || 0}, ${JSON.stringify({ message })}::jsonb,
        'active', NOW() + INTERVAL '4 hours'
      )
      RETURNING id
    `;

    const postId = (rows[0] as { id: string }).id;

    // Publish to this market's feed so rider feeds update in real-time
    const postData = { postId, userId, areas: driverAreas, price: parsedPrice, message };
    publishToChannel(feedChannelForMarket(market.slug), 'driver_available', postData).catch(() => {});
    publishAdminEvent('driver_live', { userId, market: market.slug, areas: driverAreas }).catch(() => {});

    return NextResponse.json({ postId }, { status: 201 });
  } catch (error) {
    console.error('Create driver post error:', error);
    return NextResponse.json({ error: 'Failed to post' }, { status: 500 });
  }
}

// DELETE — cancel a driver availability post
export async function DELETE(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const postId = req.nextUrl.searchParams.get('postId');
    if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const market = await resolveMarketForUser(userId);

    await sql`
      UPDATE hmu_posts SET status = 'cancelled'
      WHERE id = ${postId} AND user_id = ${userId} AND status = 'active'
    `;

    publishToChannel(feedChannelForMarket(market.slug), 'driver_offline', { postId, userId }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete driver post error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
