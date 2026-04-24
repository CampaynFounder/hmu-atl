import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { queryBrowseDrivers } from '@/lib/hmu/browse-drivers-query';
import RiderBrowseClient from './rider-browse-client';

export const dynamic = 'force-dynamic';

// Server pre-renders the first N cards so the page is usable before JS hydrates;
// the client pages the rest via /api/rider/browse/list (same query helper).
const INITIAL_BATCH = 12;

export default async function RiderBrowsePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const riderRows = await sql`
    SELECT rp.driver_preference
    FROM users u
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  const driverPreference = (riderRows[0]?.driver_preference as string | null) ?? null;

  const drivers = await queryBrowseDrivers({ driverPreference }, 0, INITIAL_BATCH);

  return (
    <RiderBrowseClient
      initialDrivers={drivers}
      initialBatchSize={INITIAL_BATCH}
    />
  );
}
