import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import LinkedClient from './linked-client';

export const dynamic = 'force-dynamic';

export default async function RiderLinkedPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const riderRows = await sql`
    SELECT id, profile_type, account_status FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  const rider = riderRows[0] as Record<string, unknown> | undefined;
  if (!rider) redirect('/sign-in');
  if (rider.profile_type !== 'rider') redirect('/');

  const riderId = rider.id as string;

  // Linked drivers — full unmask (handle, name, vehicle, chill). Mirrors /rider/browse card fields.
  const drivers = await sql`
    SELECT
      h.id AS hmu_id, h.linked_at, h.driver_id,
      dp.handle, dp.display_name, dp.areas, dp.pricing, dp.video_url,
      dp.vehicle_info, dp.lgbtq_friendly, dp.accepts_cash, dp.cash_only, dp.fwu,
      dp.vibe_video_url, dp.payout_setup_complete,
      u.chill_score, u.tier
    FROM driver_to_rider_hmus h
    JOIN users u ON u.id = h.driver_id
    JOIN driver_profiles dp ON dp.user_id = h.driver_id
    WHERE h.rider_id = ${riderId}
      AND h.status = 'linked'
      AND u.account_status = 'active'
    ORDER BY h.linked_at DESC NULLS LAST
    LIMIT 60
  `;

  return (
    <LinkedClient
      drivers={drivers.map((d: Record<string, unknown>) => {
        const vi = d.vehicle_info as Record<string, unknown> | null;
        return {
          driverId: d.driver_id as string,
          handle: d.handle as string,
          displayName: (d.display_name as string) || 'Driver',
          areas: Array.isArray(d.areas) ? (d.areas as string[]) : [],
          minPrice: Number((d.pricing as Record<string, unknown>)?.minimum ?? 0),
          videoUrl: (d.video_url as string) || null,
          photoUrl: (vi?.photo_url as string) || null,
          chillScore: Number(d.chill_score ?? 0),
          isHmuFirst: d.tier === 'hmu_first',
          lgbtqFriendly: (d.lgbtq_friendly as boolean) || false,
          acceptsCash: (d.accepts_cash as boolean) || (d.cash_only as boolean) || false,
          cashOnly: (d.cash_only as boolean) || false,
          fwu: (d.fwu as boolean) || false,
          hasVibeVideo: !!(d.vibe_video_url),
          payoutReady: !!(d.payout_setup_complete),
          vehicleSummary: (() => {
            if (!vi?.make) return null;
            const parts = [vi.year, vi.make, vi.model].filter(Boolean).join(' ');
            return parts || null;
          })(),
        };
      })}
    />
  );
}
