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

    const rows = await sql`
      SELECT id, areas, price, time_window, status, created_at
      FROM hmu_posts
      WHERE user_id = ${userId}
        AND post_type = 'rider_request'
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const posts = rows.map((r: Record<string, unknown>) => {
      const tw = (r.time_window ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        message: tw.message || tw.destination || '',
        price: Number(r.price ?? 0),
        status: r.status,
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

    const { message, price } = await req.json();

    if (!message || !price || price < 10) {
      return NextResponse.json({ error: 'Include a message and price ($10 minimum)' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Parse areas from message (simple: use first word or "ATL" default)
    const areas = ['ATL'];

    const rows = await sql`
      INSERT INTO hmu_posts (
        user_id, post_type, areas, price, time_window, status, expires_at
      ) VALUES (
        ${userId}, 'rider_request', ${JSON.stringify(areas)}::jsonb,
        ${price}, ${JSON.stringify({ message, destination: message })}::jsonb,
        'active', NOW() + INTERVAL '2 hours'
      )
      RETURNING id
    `;

    return NextResponse.json({ postId: (rows[0] as { id: string }).id }, { status: 201 });
  } catch (error) {
    console.error('Create rider post error:', error);
    return NextResponse.json({ error: 'Failed to post' }, { status: 500 });
  }
}
