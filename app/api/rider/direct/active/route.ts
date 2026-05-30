// GET /api/rider/direct/active — the signed-in rider's current active direct
// booking (hmu_posts.post_type='direct_booking'), or { post: null }.
//
// Mirrors /api/rider/down-bad/active so the mobile "My Requests" surface can
// re-enter the book/waiting screen for a pending direct booking (which needs
// the targeted driver handle + booking_expires_at for its countdown + cancel).
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ post: null });
  const riderId = (userRows[0] as { id: string }).id;

  const rows = await sql`
    SELECT hp.id, hp.price, hp.booking_expires_at,
           hp.pickup_address, hp.dropoff_address,
           dp.handle AS driver_handle
    FROM hmu_posts hp
    LEFT JOIN driver_profiles dp ON dp.user_id = hp.target_driver_id
    WHERE hp.user_id = ${riderId}
      AND hp.post_type = 'direct_booking'
      AND hp.status = 'active'
      AND hp.booking_expires_at > NOW()
    ORDER BY hp.created_at DESC
    LIMIT 1
  `;

  if (!rows.length) return NextResponse.json({ post: null });

  const row = rows[0] as Record<string, unknown>;
  return NextResponse.json({
    post: {
      id: row.id as string,
      handle: (row.driver_handle as string) || '',
      price: Number(row.price),
      expiresAt: row.booking_expires_at as string,
      pickupAddress: (row.pickup_address as string) || '',
      dropoffAddress: (row.dropoff_address as string) || '',
    },
  });
}
