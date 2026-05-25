// GET /api/rider/down-bad/active
// Returns the rider's current active Down Bad post, or { post: null }.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ post: null });

  const riderId = (userRows[0] as { id: string }).id;

  const rows = await sql`
    SELECT id, price, expires_at, pickup_address, dropoff_address,
           sum_extra_text, sum_extra_media_url, sum_extra_media_type,
           target_driver_id
    FROM hmu_posts
    WHERE user_id = ${riderId}
      AND post_type = 'down_bad'
      AND status = 'active'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ post: null });

  const row = rows[0] as Record<string, unknown>;
  return NextResponse.json({
    post: {
      id: row.id as string,
      price: Number(row.price),
      expiresAt: row.expires_at as string,
      pickupAddress: (row.pickup_address as string) || '',
      dropoffAddress: (row.dropoff_address as string) || '',
      sumExtraText: (row.sum_extra_text as string) || '',
      sumExtraMediaUrl: (row.sum_extra_media_url as string) || null,
      sumExtraMediaType: (row.sum_extra_media_type as string) || 'photo',
      isTargeted: row.target_driver_id !== null,
    },
  });
}
