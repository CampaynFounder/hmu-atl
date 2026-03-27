import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const driverUserId = (userRows[0] as { id: string }).id;

  // Get driver's cash preferences
  const driverPrefRows = await sql`SELECT accepts_cash, cash_only FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1`;
  const driverPrefs = (driverPrefRows[0] || {}) as { accepts_cash: boolean; cash_only: boolean };

  // Fetch active requests that don't already have a ride (not yet accepted/COO'd)
  const rows = await sql`
    SELECT
      p.id,
      p.post_type,
      p.price,
      p.time_window,
      p.booking_expires_at,
      p.expires_at,
      p.created_at,
      COALESCE(rp.handle, rp.display_name, 'Rider') AS rider_name,
      rp.handle AS rider_handle,
      rp.avatar_url AS rider_avatar_url,
      rp.video_url AS rider_video_url,
      u2.chill_score AS rider_chill_score,
      u2.completed_rides AS rider_completed_rides,
      p.is_cash
    FROM hmu_posts p
    LEFT JOIN rider_profiles rp ON rp.user_id = p.user_id
    LEFT JOIN users u2 ON u2.id = p.user_id
    LEFT JOIN rides r ON r.hmu_post_id = p.id AND r.status NOT IN ('cancelled')
    WHERE p.status = 'active'
      AND r.id IS NULL
      AND (
        (p.post_type = 'direct_booking' AND p.target_driver_id = ${driverUserId} AND p.booking_expires_at > NOW())
        OR
        (p.post_type = 'rider_request' AND p.expires_at > NOW())
      )
    ORDER BY p.created_at DESC
  `;

  const requests = rows.map((row: Record<string, unknown>) => {
    const tw = (row.time_window ?? {}) as Record<string, unknown>;
    const createdAt = new Date(row.created_at as string);
    const minutesAgo = (Date.now() - createdAt.getTime()) / 60000;
    return {
      id: row.id,
      type: row.post_type === 'direct_booking' ? 'direct' : 'open',
      riderName: row.rider_name ?? 'Rider',
      riderHandle: (row.rider_handle as string) || null,
      riderAvatarUrl: (row.rider_avatar_url as string) || null,
      riderVideoUrl: (row.rider_video_url as string) || null,
      riderChillScore: Number(row.rider_chill_score ?? 0),
      riderCompletedRides: Number(row.rider_completed_rides ?? 0),
      isCash: (row.is_cash as boolean) || false,
      destination: tw.destination ?? tw.message ?? tw.note ?? '',
      time: tw.time ?? '',
      stops: tw.stops ?? '',
      roundTrip: tw.round_trip === true,
      price: Number(row.price ?? 0),
      expiresAt: row.booking_expires_at || row.expires_at,
      createdAt: row.created_at,
      riderOnline: minutesAgo < 30,
    };
  });

  // Filter based on driver cash preferences
  let filtered = requests;
  if (driverPrefs.cash_only) {
    // Cash-only drivers only see cash rides
    filtered = requests.filter((r: Record<string, unknown>) => r.isCash === true);
  } else if (!driverPrefs.accepts_cash) {
    // Drivers who don't accept cash: deprioritize cash rides (show digital first, cash last)
    filtered = [
      ...requests.filter((r: Record<string, unknown>) => r.isCash !== true),
      ...requests.filter((r: Record<string, unknown>) => r.isCash === true),
    ];
  }

  return NextResponse.json({ requests: filtered });
}
