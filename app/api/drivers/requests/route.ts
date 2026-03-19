import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const driverUserId = (userRows[0] as { id: string }).id;

  // Fetch both direct bookings AND broadcast rider requests
  const rows = await sql`
    SELECT
      p.id,
      p.post_type,
      p.price,
      p.time_window,
      p.booking_expires_at,
      p.expires_at,
      p.created_at,
      COALESCE(rp.display_name, rp.first_name, 'Rider') AS rider_name
    FROM hmu_posts p
    LEFT JOIN rider_profiles rp ON rp.user_id = p.user_id
    WHERE p.status = 'active'
      AND (
        (p.post_type = 'direct_booking' AND p.target_driver_id = ${driverUserId} AND p.booking_expires_at > NOW())
        OR
        (p.post_type = 'rider_request' AND p.expires_at > NOW())
      )
    ORDER BY p.created_at DESC
  `;

  const requests = rows.map((row: Record<string, unknown>) => {
    const tw = (row.time_window ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      type: row.post_type === 'direct_booking' ? 'direct' : 'broadcast',
      riderName: row.rider_name ?? 'Rider',
      destination: tw.destination ?? tw.message ?? tw.note ?? '',
      time: tw.time ?? '',
      stops: tw.stops ?? '',
      roundTrip: tw.round_trip === true,
      price: Number(row.price ?? 0),
      expiresAt: row.booking_expires_at || row.expires_at,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ requests });
}
