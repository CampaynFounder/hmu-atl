// GET /api/rider/hmus — list incoming active HMUs for the signed-in rider,
// with an unread count derived from user_notifications.
// The inbox UI on /rider/home consumes this.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/guards';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const hmus = await sql`
    SELECT h.id AS hmu_id, h.created_at, h.message, h.driver_id,
           dp.handle, dp.display_name, dp.areas, dp.thumbnail_url,
           (dp.vehicle_info->>'photo_url') AS vehicle_photo_url
    FROM driver_to_rider_hmus h
    JOIN users u ON u.id = h.driver_id
    LEFT JOIN driver_profiles dp ON dp.user_id = h.driver_id
    WHERE h.rider_id = ${user.id}
      AND h.status = 'active'
      AND h.expires_at > NOW()
      AND u.account_status = 'active'
    ORDER BY h.created_at DESC
    LIMIT 30
  `;

  const unreadRows = await sql`
    SELECT COUNT(*)::int AS n
    FROM user_notifications
    WHERE user_id = ${user.id}
      AND type = 'hmu_received'
      AND read_at IS NULL
  `;
  const unreadCount = Number((unreadRows[0] as { n: number })?.n ?? 0);

  return NextResponse.json({
    unreadCount,
    hmus: hmus.map((h: Record<string, unknown>) => ({
      hmuId: h.hmu_id as string,
      driverId: h.driver_id as string,
      handle: (h.handle as string) || '',
      displayName: (h.display_name as string) || 'Driver',
      areas: Array.isArray(h.areas) ? (h.areas as string[]) : [],
      avatarUrl: (h.thumbnail_url as string) || (h.vehicle_photo_url as string) || null,
      message: (h.message as string) || null,
      createdAt: h.created_at as string,
    })),
  });
}
