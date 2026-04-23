import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import RiderBrowseClient from './rider-browse-client';

export default async function RiderBrowsePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  // Resolve the viewing rider's strict gender preference (women_only / men_only).
  // Soft prefs (prefer_*) and no_preference don't filter — they're sort hints at best.
  const riderRows = await sql`
    SELECT rp.driver_preference
    FROM users u
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  const pref = (riderRows[0]?.driver_preference as string | null) ?? null;
  const strictFilter: 'female' | 'male' | null =
    pref === 'women_only' || pref === 'female' ? 'female' :
    pref === 'men_only' || pref === 'male' ? 'male' : null;

  // Fetch visible drivers + their active availability posts.
  // Gender filter tolerates legacy (male/female) + new (man/woman) values on driver_profiles.gender.
  const drivers = await sql`
    SELECT dp.handle, dp.display_name, dp.areas, dp.pricing, dp.video_url,
           dp.vehicle_info, dp.lgbtq_friendly, dp.enforce_minimum, dp.fwu, dp.accepts_cash, dp.cash_only,
           dp.vibe_video_url, dp.payout_setup_complete,
           u.chill_score, u.tier,
           hp.time_window as live_post, hp.price as live_price, hp.expires_at as live_expires,
           (SELECT COALESCE(array_agg(DISTINCT COALESCE(smi.icon, dsm.custom_icon)), '{}')
            FROM driver_service_menu dsm
            LEFT JOIN service_menu_items smi ON dsm.item_id = smi.id
            WHERE dsm.driver_id = dp.user_id AND dsm.is_active = true
           ) as service_icons
    FROM driver_profiles dp
    JOIN users u ON u.id = dp.user_id
    LEFT JOIN hmu_posts hp ON hp.user_id = dp.user_id
      AND hp.post_type = 'driver_available'
      AND hp.status = 'active'
      AND hp.expires_at > NOW()
    WHERE dp.profile_visible = true
      AND u.account_status = 'active'
      AND (
        ${strictFilter}::text IS NULL
        OR (${strictFilter} = 'female' AND LOWER(dp.gender) IN ('female','woman'))
        OR (${strictFilter} = 'male'   AND LOWER(dp.gender) IN ('male','man'))
      )
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
          hasVibeVideo: !!(d.vibe_video_url),
          payoutReady: !!(d.payout_setup_complete),
          liveMessage: livePost?.message as string || null,
          livePrice: d.live_price ? Number(d.live_price) : null,
          serviceIcons: Array.isArray(d.service_icons) ? (d.service_icons as string[]).filter(Boolean) : [],
          vehicleSummary: (() => {
            const vi = d.vehicle_info as Record<string, unknown> | null;
            if (!vi?.make) return null;
            const parts = [vi.year, vi.make, vi.model].filter(Boolean).join(' ');
            const maxR = Number(vi.max_adults || 0) + Number(vi.max_children || 0);
            return { label: parts, maxRiders: maxR || null };
          })(),
        };
      })}
    />
  );
}
