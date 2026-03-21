import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import RiderBrowseClient from './rider-browse-client';

export default async function RiderBrowsePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  // Fetch visible drivers + their active availability posts
  const drivers = await sql`
    SELECT dp.handle, dp.display_name, dp.areas, dp.pricing, dp.video_url,
           dp.vehicle_info, dp.lgbtq_friendly, dp.enforce_minimum, dp.fwu, dp.accepts_cash, dp.cash_only,
           u.chill_score, u.tier,
           hp.time_window as live_post, hp.price as live_price, hp.expires_at as live_expires
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    LEFT JOIN hmu_posts hp ON hp.user_id = dp.user_id
      AND hp.post_type = 'driver_available'
      AND hp.status = 'active'
      AND hp.expires_at > NOW()
    WHERE dp.profile_visible = true
      AND u.account_status = 'active'
    ORDER BY
      CASE WHEN hp.id IS NOT NULL THEN 0 ELSE 1 END,
      u.tier DESC, u.chill_score DESC
    LIMIT 30
  `;

  return (
    <RiderBrowseClient
      drivers={drivers.map((d: Record<string, unknown>) => {
        const livePost = d.live_post as Record<string, unknown> | null;
        return {
          handle: d.handle as string,
          displayName: (d.display_name as string) || 'Driver',
          areas: Array.isArray(d.areas) ? d.areas as string[] : [],
          minPrice: Number((d.pricing as Record<string, unknown>)?.minimum ?? 0),
          videoUrl: (d.video_url as string) || null,
          photoUrl: ((d.vehicle_info as Record<string, unknown>)?.photo_url as string) || null,
          lgbtqFriendly: (d.lgbtq_friendly as boolean) || false,
          chillScore: Number(d.chill_score ?? 0),
          isHmuFirst: d.tier === 'hmu_first',
          enforceMinimum: d.enforce_minimum !== false,
          fwu: (d.fwu as boolean) || false,
          acceptsCash: (d.accepts_cash as boolean) || (d.cash_only as boolean) || false,
          cashOnly: (d.cash_only as boolean) || false,
          liveMessage: livePost?.message as string || null,
          livePrice: d.live_price ? Number(d.live_price) : null,
        };
      })}
    />
  );
}
