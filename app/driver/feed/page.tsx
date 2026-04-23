import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DriverFeedClient from './driver-feed-client';

// Statuses that count as "driver has active work right now."
// Mirrors /api/rides/active so both stay consistent.
const ACTIVE_RIDE_STATUSES = ['accepted', 'matched', 'otw', 'here', 'active', 'in_progress'];

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

  // Mid-ride, the card-stack UX is the wrong surface — send the driver back
  // to the ride they're already on. /driver/find-riders keeps a banner instead
  // since it's a quieter discovery surface.
  const activeRide = await sql`
    SELECT id FROM rides
    WHERE driver_id = ${userId}
      AND status = ANY(${ACTIVE_RIDE_STATUSES}::text[])
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (activeRide.length) {
    redirect(`/ride/${(activeRide[0] as { id: string }).id}`);
  }

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
