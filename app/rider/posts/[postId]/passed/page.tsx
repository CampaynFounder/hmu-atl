import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getMarketAreas } from '@/lib/markets/areas';
import DriverPassedClient from './driver-passed-client';

export const dynamic = 'force-dynamic';

export default async function DriverPassedPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const { postId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/rider/home');
  const riderId = (userRows[0] as { id: string }).id;

  const postRows = await sql`
    SELECT hp.id, hp.price, hp.status, hp.time_window, hp.market_id,
           hp.pickup_area_slug, hp.dropoff_area_slug, hp.dropoff_in_market,
           (SELECT display_name FROM driver_profiles WHERE user_id = hp.last_declined_by LIMIT 1) AS driver_name
    FROM hmu_posts hp
    WHERE hp.id = ${postId} AND hp.user_id = ${riderId}
    LIMIT 1
  `;

  if (!postRows.length) redirect('/rider/home');
  const post = postRows[0] as {
    id: string; price: number; status: string; time_window: Record<string, unknown>;
    market_id: string; pickup_area_slug: string | null; dropoff_area_slug: string | null;
    dropoff_in_market: boolean; driver_name: string | null;
  };

  // If the post has been resolved elsewhere, bail back to home
  if (post.status !== 'declined_awaiting_rider') redirect('/rider/home');

  const areas = await getMarketAreas(post.market_id);

  const tw = post.time_window || {};
  return (
    <DriverPassedClient
      postId={post.id}
      price={Number(post.price || 0)}
      driverName={post.driver_name || 'The driver'}
      message={(tw.message as string) || (tw.destination as string) || ''}
      pickupSlug={post.pickup_area_slug}
      dropoffSlug={post.dropoff_area_slug}
      areas={areas.map(a => ({ slug: a.slug, name: a.name, cardinal: a.cardinal }))}
    />
  );
}
