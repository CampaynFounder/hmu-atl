// GET /api/rider/down-bad/[postId] — Down Bad post status for the rider's status page.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  const postRows = await sql`
    SELECT
      p.id, p.status, p.price, p.expires_at,
      p.pickup_address, p.dropoff_address,
      p.sum_extra_text, p.sum_extra_media_url, p.sum_extra_media_type,
      p.target_driver_id,
      p.user_id
    FROM hmu_posts p
    WHERE p.id = ${postId}
      AND p.post_type = 'down_bad'
    LIMIT 1
  `;

  if (!postRows.length) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  const post = postRows[0] as Record<string, unknown>;

  if (post.user_id !== riderId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Look up the matched ride if post is matched.
  let rideId: string | null = null;
  let driverName: string | null = null;
  let driverHandle: string | null = null;
  let driverAvatarUrl: string | null = null;

  if (post.status === 'matched') {
    const rideRows = await sql`
      SELECT r.id, dp.handle, dp.display_name, dp.thumbnail_url
      FROM rides r
      LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
      WHERE r.hmu_post_id = ${postId}
        AND r.status NOT IN ('cancelled')
      ORDER BY r.created_at DESC
      LIMIT 1
    `;
    if (rideRows.length) {
      const ride = rideRows[0] as Record<string, unknown>;
      rideId = ride.id as string;
      driverHandle = (ride.handle as string) || null;
      driverName = (ride.display_name as string) || driverHandle || 'Driver';
      driverAvatarUrl = (ride.thumbnail_url as string) || null;
    }
  }

  return NextResponse.json({
    post: {
      id: post.id as string,
      status: post.status as string,
      price: Number(post.price),
      expiresAt: post.expires_at as string,
      pickupAddress: (post.pickup_address as string) || '',
      dropoffAddress: (post.dropoff_address as string) || '',
      sumExtraText: (post.sum_extra_text as string) || '',
      sumExtraMediaUrl: (post.sum_extra_media_url as string) || '',
      sumExtraMediaType: (post.sum_extra_media_type as 'photo' | 'video') || 'photo',
      isDirectOffer: !!post.target_driver_id,
    },
    rideId,
    driverName,
    driverHandle,
    driverAvatarUrl,
  });
}
