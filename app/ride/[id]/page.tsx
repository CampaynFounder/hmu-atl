import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import ActiveRideClient from './active-ride-client';

export default async function RidePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const { id: rideId } = await params;

  const userRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const user = userRows[0] as { id: string; profile_type: string };

  const rideRows = await sql`
    SELECT r.*,
      dp.display_name as driver_name, dp.handle as driver_handle,
      rp.first_name as rider_first_name
    FROM rides r
    LEFT JOIN driver_profiles dp ON dp.user_id = r.driver_id
    LEFT JOIN rider_profiles rp ON rp.user_id = r.rider_id
    WHERE r.id = ${rideId} AND (r.driver_id = ${user.id} OR r.rider_id = ${user.id})
    LIMIT 1
  `;

  if (!rideRows.length) redirect('/');

  const ride = rideRows[0] as Record<string, unknown>;
  const isDriver = ride.driver_id === user.id;

  return (
    <ActiveRideClient
      rideId={rideId}
      userId={user.id}
      isDriver={isDriver}
      initialRide={{
        status: ride.status as string,
        driverName: (ride.driver_name as string) || 'Driver',
        riderName: (ride.rider_first_name as string) || 'Rider',
        agreedPrice: Number(ride.final_agreed_price || ride.amount || 0),
        agreementSummary: ride.agreement_summary as Record<string, unknown> | null,
        pickup: ride.pickup as Record<string, unknown> | null,
        dropoff: ride.dropoff as Record<string, unknown> | null,
        stops: ride.stops as unknown[] | null,
        otwAt: ride.otw_at as string | null,
        hereAt: ride.here_at as string | null,
        startedAt: ride.started_at as string | null,
        endedAt: ride.ended_at as string | null,
        disputeWindowExpiresAt: ride.dispute_window_expires_at as string | null,
        driverPayoutAmount: Number(ride.driver_payout_amount || 0),
        platformFeeAmount: Number(ride.platform_fee_amount || 0),
      }}
      mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}
    />
  );
}
