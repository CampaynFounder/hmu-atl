// Stream C — driver feed of all open blasts in the driver's market.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §3 D-1: NEW page (didn't exist in v2);
// visible to ALL drivers (not just targeted ones), filtered by admin
// feed_min_score_percentile per market. Targeted drivers ALSO get SMS;
// non-targeted can still discover + bid in.

import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { DriverRequestsClient } from './driver-requests-client';

export const dynamic = 'force-dynamic';

export default async function DriverRequestsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in?returnTo=/driver/requests');

  const rows = await sql`
    SELECT u.id, u.profile_type, u.market_id, m.slug AS market_slug,
           m.feed_min_score_percentile,
           dp.current_lat, dp.current_lng
    FROM users u
    LEFT JOIN markets m ON m.id = u.market_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  if (!rows.length) redirect('/onboarding?type=driver');
  const me = rows[0] as {
    id: string;
    profile_type: string;
    market_id: string | null;
    market_slug: string | null;
    feed_min_score_percentile: number | null;
    current_lat: number | null;
    current_lng: number | null;
  };
  if (me.profile_type !== 'driver') redirect('/');

  return (
    <DriverRequestsClient
      driverId={me.id}
      marketSlug={me.market_slug ?? 'atl'}
      driverLat={me.current_lat}
      driverLng={me.current_lng}
      feedMinScorePercentile={me.feed_min_score_percentile ?? 0}
    />
  );
}
