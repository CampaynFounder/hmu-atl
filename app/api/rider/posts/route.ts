import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

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

    const rows = await sql`
      SELECT p.id, p.areas, p.price, p.time_window, p.status, p.post_type,
             p.created_at, p.booking_expires_at,
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

    const { message, price, is_cash } = await req.json();

    if (!message || !price || price < 1) {
      return NextResponse.json({ error: 'Include a message and price ($1 minimum)' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Block if rider already has an active ride (matched/otw/here/active)
    const activeRides = await sql`SELECT id FROM rides WHERE rider_id = ${userId} AND status IN ('matched','otw','here','active') LIMIT 1`;
    if (activeRides.length) {
      return NextResponse.json({ error: 'You already have an active ride', code: 'active_ride', rideId: (activeRides[0] as { id: string }).id }, { status: 409 });
    }

    const rows = await sql`
      INSERT INTO hmu_posts (
        user_id, post_type, areas, price, time_window, status, expires_at, is_cash
      ) VALUES (
        ${userId}, 'rider_request', ${['ATL']},
        ${price}, ${JSON.stringify({ message, destination: message })}::jsonb,
        'active', NOW() + INTERVAL '2 hours', ${is_cash || false}
      )
      RETURNING id
    `;

    return NextResponse.json({ postId: (rows[0] as { id: string }).id }, { status: 201 });
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

    await sql`
      UPDATE hmu_posts SET status = 'cancelled'
      WHERE id = ${postId} AND user_id = ${userId} AND status = 'active'
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete rider post error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
