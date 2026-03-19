import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import RiderBrowseClient from './rider-browse-client';

export default async function RiderBrowsePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  // Fetch visible drivers
  const drivers = await sql`
    SELECT dp.handle, dp.display_name, dp.areas, dp.pricing, dp.video_url,
           dp.vehicle_info, dp.lgbtq_friendly,
           u.chill_score, u.tier
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.profile_visible = true
      AND u.account_status = 'active'
    ORDER BY u.tier DESC, u.chill_score DESC
    LIMIT 20
  `;

  return (
    <RiderBrowseClient
      drivers={drivers.map((d: Record<string, unknown>) => ({
        handle: d.handle as string,
        displayName: (d.display_name as string) || 'Driver',
        areas: Array.isArray(d.areas) ? d.areas as string[] : [],
        minPrice: Number((d.pricing as Record<string, unknown>)?.minimum ?? 0),
        videoUrl: (d.video_url as string) || null,
        photoUrl: ((d.vehicle_info as Record<string, unknown>)?.photo_url as string) || null,
        lgbtqFriendly: (d.lgbtq_friendly as boolean) || false,
        chillScore: Number(d.chill_score ?? 0),
        isHmuFirst: d.tier === 'hmu_first',
      }))}
    />
  );
}
