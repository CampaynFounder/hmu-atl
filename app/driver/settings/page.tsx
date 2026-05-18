import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DriverSettingsClient from './driver-settings-client';

export default async function DriverSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`
    SELECT u.id, u.tier,
           dp.location_sharing_enabled,
           dp.home_label, dp.home_lat, dp.home_lng
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
     WHERE u.clerk_id = ${clerkId}
     LIMIT 1
  `;
  if (!userRows.length) redirect('/onboarding?type=driver');

  const user = userRows[0] as {
    id: string;
    tier: string;
    location_sharing_enabled: boolean | null;
    home_label: string | null;
    home_lat: number | null;
    home_lng: number | null;
  };

  return (
    <DriverSettingsClient
      tier={user.tier}
      locationSharingEnabled={user.location_sharing_enabled !== false}
      homeLabel={user.home_label}
      homeLat={user.home_lat ? Number(user.home_lat) : null}
      homeLng={user.home_lng ? Number(user.home_lng) : null}
    />
  );
}
