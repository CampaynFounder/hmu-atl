import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DriverHomeClient from './driver-home-client';

export default async function DriverHomePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  // Fetch user + driver profile
  const userRows = await sql`
    SELECT id, tier FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) redirect('/onboarding?type=driver');

  const user = userRows[0] as { id: string; tier: string };

  const profileRows = await sql`
    SELECT handle, display_name, first_name, areas, pricing
    FROM driver_profiles
    WHERE user_id = ${user.id}
    LIMIT 1
  `;
  if (!profileRows.length) redirect('/onboarding?type=driver');

  const profile = profileRows[0] as {
    handle: string;
    display_name: string | null;
    first_name: string | null;
    areas: string[];
    pricing: Record<string, unknown>;
  };

  const displayName = profile.display_name || profile.first_name || profile.handle || 'Driver';
  const shareUrl = `atl.hmucashride.com/d/${profile.handle}`;

  return (
    <DriverHomeClient
      handle={profile.handle}
      displayName={displayName}
      shareUrl={shareUrl}
      areas={Array.isArray(profile.areas) ? profile.areas : []}
      pricing={profile.pricing ?? {}}
      isHmuFirst={user.tier === 'hmu_first'}
    />
  );
}
