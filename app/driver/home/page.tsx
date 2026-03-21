import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DriverHomeClient from './driver-home-client';

export default async function DriverHomePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  // Fetch user + driver profile
  const userRows = await sql`
    SELECT id, tier, completed_rides FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) redirect('/onboarding?type=driver');

  const user = userRows[0] as { id: string; tier: string; completed_rides: number };

  // Auto-expire stale live posts
  await sql`
    UPDATE hmu_posts SET status = 'expired'
    WHERE user_id = ${user.id}
      AND post_type = 'driver_available'
      AND status = 'active'
      AND expires_at < NOW()
  `;

  const profileRows = await sql`
    SELECT handle, display_name, first_name, areas, pricing, payout_setup_complete, cash_only
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
    payout_setup_complete: boolean;
    cash_only: boolean;
  };

  const displayName = profile.display_name || profile.first_name || profile.handle || 'Driver';
  const shareUrl = `atl.hmucashride.com/d/${profile.handle}`;

  return (
    <DriverHomeClient
      userId={user.id}
      handle={profile.handle}
      displayName={displayName}
      shareUrl={shareUrl}
      areas={Array.isArray(profile.areas) ? profile.areas : []}
      pricing={profile.pricing ?? {}}
      isHmuFirst={user.tier === 'hmu_first'}
      completedRides={Number(user.completed_rides ?? 0)}
      payoutSetup={!!profile.payout_setup_complete}
      cashOnly={!!profile.cash_only}
    />
  );
}
