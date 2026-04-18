import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DriverFeedClient from './driver-feed-client';

export default async function DriverFeedPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`
    SELECT u.id, m.slug AS market_slug
    FROM users u
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  if (!userRows.length) redirect('/onboarding?type=driver');

  const userId = (userRows[0] as { id: string; market_slug: string | null }).id;
  const marketSlug = (userRows[0] as { id: string; market_slug: string | null }).market_slug || 'atl';

  const profileRows = await sql`
    SELECT handle, area_slugs, services_entire_market, accepts_long_distance
    FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
  `;
  if (!profileRows.length) redirect('/onboarding?type=driver');

  const profile = profileRows[0] as {
    handle: string | null;
    area_slugs: string[] | null;
    services_entire_market: boolean;
    accepts_long_distance: boolean;
  };
  const driverAreas: string[] = Array.isArray(profile.area_slugs) ? profile.area_slugs : [];

  return (
    <DriverFeedClient
      driverUserId={userId}
      driverAreas={driverAreas}
      marketSlug={marketSlug}
    />
  );
}
