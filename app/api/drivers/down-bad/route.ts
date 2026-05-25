// GET /api/drivers/down-bad — active Down Bad posts the driver hasn't passed on yet.
// Used by the /driver/down-bad swipe deck.

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveMarketForUser } from '@/lib/markets/resolver';

export const runtime = 'nodejs';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`
    SELECT u.id FROM users u WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverUserId = (userRows[0] as { id: string }).id;

  // Verify driver has opted in before serving the deck.
  const dpRows = await sql`
    SELECT accepts_down_bad FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1
  `;
  if (!dpRows.length || !(dpRows[0] as Record<string, unknown>).accepts_down_bad) {
    return NextResponse.json({ error: 'Down Bad not enabled', code: 'not_enabled' }, { status: 403 });
  }

  const market = await resolveMarketForUser(driverUserId);

  const rows = await sql`
    SELECT
      p.id,
      p.price,
      p.expires_at,
      p.pickup_address,
      p.dropoff_address,
      p.sum_extra_text,
      p.sum_extra_media_url,
      p.sum_extra_media_type,
      p.ride_details,
      p.target_driver_id,
      p.created_at,
      COALESCE(rp.handle, rp.display_name, 'Rider') AS rider_name,
      COALESCE(rp.thumbnail_url, rp.avatar_url)       AS rider_avatar_url,
      u.chill_score,
      u.completed_rides
    FROM hmu_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN rider_profiles rp ON rp.user_id = p.user_id
    WHERE p.post_type = 'down_bad'
      AND p.status = 'active'
      AND p.expires_at > NOW()
      AND (
        -- Broadcast posts visible to all opted-in drivers in market
        (p.target_driver_id IS NULL AND p.market_id = ${market.market_id})
        OR
        -- Direct Down Bad offer specifically for this driver
        p.target_driver_id = ${driverUserId}
      )
      AND NOT EXISTS (
        SELECT 1 FROM ride_interests ri
        WHERE ri.post_id = p.id
          AND ri.driver_id = ${driverUserId}
          AND ri.status = 'passed'
      )
    ORDER BY
      (p.target_driver_id = ${driverUserId}) DESC,
      p.created_at DESC
    LIMIT 30
  `;

  const posts = rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    price: Number(row.price),
    expiresAt: row.expires_at as string,
    pickupAddress: (row.pickup_address as string) || '',
    dropoffAddress: (row.dropoff_address as string) || '',
    sumExtraText: (row.sum_extra_text as string) || '',
    sumExtraMediaUrl: (row.sum_extra_media_url as string) || '',
    sumExtraMediaType: (row.sum_extra_media_type as 'photo' | 'video') || 'photo',
    rideDetails: (row.ride_details as { additionalPassengers: number; kids: number; luggage: 'none' | 'bag' | 'trunk' } | null) ?? null,
    isDirectOffer: row.target_driver_id === driverUserId,
    riderName: row.rider_name as string,
    riderAvatarUrl: (row.rider_avatar_url as string) || null,
    chillScore: Number(row.chill_score || 0),
    completedRides: Number(row.completed_rides || 0),
    createdAt: row.created_at as string,
  }));

  return NextResponse.json({ posts, marketSlug: market.slug });
}
