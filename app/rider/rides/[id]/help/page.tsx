import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import RideHelpClient from './ride-help-client';

export default async function RideHelpPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const { id: rideId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const userId = (userRows[0] as { id: string }).id;

  const rideRows = await sql`
    SELECT
      r.id, r.ref_code, r.status,
      COALESCE(r.final_agreed_price, r.amount) as price,
      r.is_cash, r.pickup_address, r.dropoff_address,
      r.created_at, r.started_at, r.ended_at,
      dp.display_name as driver_name, dp.handle as driver_handle
    FROM rides r
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    WHERE r.id = ${rideId} AND r.rider_id = ${userId}
    LIMIT 1
  `;

  if (!rideRows.length) redirect('/rider/rides');
  const r = rideRows[0] as Record<string, unknown>;

  return (
    <RideHelpClient
      ride={{
        id: r.id as string,
        refCode: (r.ref_code as string) || null,
        status: r.status as string,
        price: Number(r.price || 0),
        isCash: (r.is_cash as boolean) || false,
        driverName: (r.driver_name as string) || 'Driver',
        driverHandle: (r.driver_handle as string) || null,
        pickupAddress: (r.pickup_address as string) || null,
        dropoffAddress: (r.dropoff_address as string) || null,
        createdAt: r.created_at as string,
      }}
    />
  );
}
