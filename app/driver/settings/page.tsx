import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DriverSettingsClient from './driver-settings-client';

export default async function DriverSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  // Step 1: user + driver profile existence check (pre-existing columns only).
  // Keeps the INNER JOIN so a driver without a driver_profiles row still gets
  // redirected to onboarding — just doesn't select the new column that may not
  // exist yet if the migration is still rolling out.
  const userRows = await sql`
    SELECT u.id, u.tier,
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
    home_label: string | null;
    home_lat: number | null;
    home_lng: number | null;
  };

  // Step 2: try to read location_sharing_enabled separately.
  // This column was added in the 2026-05-18-driver-location-sharing migration.
  // If the migration hasn't been applied yet the query throws — default to true
  // so the settings page stays functional and the Location tab can load normally.
  let locationSharingEnabled = true;
  try {
    const lsRows = await sql`
      SELECT location_sharing_enabled FROM driver_profiles WHERE user_id = ${user.id} LIMIT 1
    `;
    if (lsRows[0]) {
      const row = lsRows[0] as { location_sharing_enabled: boolean | null };
      locationSharingEnabled = row.location_sharing_enabled !== false;
    }
  } catch {
    // Column not yet migrated — stay true (default-on).
  }

  return (
    <DriverSettingsClient
      tier={user.tier}
      locationSharingEnabled={locationSharingEnabled}
      homeLabel={user.home_label}
      homeLat={user.home_lat ? Number(user.home_lat) : null}
      homeLng={user.home_lng ? Number(user.home_lng) : null}
    />
  );
}
