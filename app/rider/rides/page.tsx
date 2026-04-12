import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import RiderRidesClient from './rider-rides-client';

export default async function RiderRidesPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const user = userRows[0] as { id: string; profile_type: string };

  const rides = await sql`
    SELECT
      r.id, r.ref_code, r.status,
      COALESCE(r.final_agreed_price, r.amount) as price,
      r.is_cash, r.driver_rating, r.rider_rating,
      r.pickup_address, r.dropoff_address,
      r.created_at, r.started_at, r.ended_at,
      r.dispute_window_expires_at,
      dp.display_name as driver_name, dp.handle as driver_handle,
      dp.thumbnail_url as driver_avatar
    FROM rides r
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    WHERE r.rider_id = ${user.id}
    ORDER BY r.created_at DESC
    LIMIT 50
  `;

  const mapped = rides.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    refCode: (r.ref_code as string) || null,
    status: r.status as string,
    price: Number(r.price || 0),
    isCash: (r.is_cash as boolean) || false,
    driverName: (r.driver_name as string) || 'Driver',
    driverHandle: (r.driver_handle as string) || null,
    driverAvatar: (r.driver_avatar as string) || null,
    driverRating: (r.driver_rating as string) || null,
    riderRating: (r.rider_rating as string) || null,
    pickupAddress: (r.pickup_address as string) || null,
    dropoffAddress: (r.dropoff_address as string) || null,
    createdAt: r.created_at as string,
    startedAt: (r.started_at as string) || null,
    endedAt: (r.ended_at as string) || null,
    disputeWindowExpiresAt: (r.dispute_window_expires_at as string) || null,
  }));

  return <RiderRidesClient rides={mapped} />;
}
