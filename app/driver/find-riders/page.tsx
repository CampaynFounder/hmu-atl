import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { readHmuConfig, hmuCapKey } from '@/lib/hmu/helpers';
import ActiveRideBanner from '@/components/driver/active-ride-banner';
import FindRidersClient from './find-riders-client';

export const dynamic = 'force-dynamic';

export default async function FindRidersPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const driverRows = await sql`
    SELECT u.id, u.profile_type, u.account_status, u.tier, u.market_id,
           dp.gender AS driver_gender,
           up.rider_gender_pref AS driver_rider_gender_pref
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN user_preferences up ON up.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  const driver = driverRows[0] as Record<string, unknown> | undefined;
  if (!driver) redirect('/sign-in');
  if (driver.profile_type !== 'driver') redirect('/');
  if (driver.account_status !== 'active') redirect('/pending');

  const driverId = driver.id as string;
  const driverMarketId = (driver.market_id as string | null) ?? null;
  const driverTier = (driver.tier === 'hmu_first' ? 'hmu_first' : 'free') as 'free' | 'hmu_first';
  const driverGender = ((driver.driver_gender as string | null) || '').toLowerCase();
  // Driver's preference for which rider genders to see. Only `women_only` / `men_only` filter hard.
  const riderPref = (driver.driver_rider_gender_pref as string | null) ?? null;
  const strictRiderFilter: 'female' | 'male' | null =
    riderPref === 'women_only' ? 'female' :
    riderPref === 'men_only' ? 'male' : null;

  // Riders in same market, active, not blocking this driver, not already active/linked with this driver.
  // Gender check:
  //   - Driver's strict rider_gender_pref filters riders.
  //   - Rider's driver_preference (women_only / men_only) filters whether this driver is visible to them
  //     → enforce symmetrically so we only surface riders who would want to see this driver.
  // driver_profiles.gender has mixed legacy (`male`/`female`) + new (`man`/`woman`) values — tolerate both.
  const riders = await sql`
    SELECT u.id, rp.handle, rp.avatar_url, rp.thumbnail_url, rp.home_areas,
           rp.first_name, rp.driver_preference,
           rp.gender AS rider_gender
    FROM users u
    JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.profile_type = 'rider'
      AND u.account_status = 'active'
      AND u.id <> ${driverId}
      AND (${driverMarketId}::uuid IS NULL OR u.market_id = ${driverMarketId}::uuid)
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users b
        WHERE b.blocker_id = u.id AND b.blocked_id = ${driverId}
      )
      AND NOT EXISTS (
        SELECT 1 FROM driver_to_rider_hmus h
        WHERE h.driver_id = ${driverId} AND h.rider_id = u.id
          AND h.status IN ('active','linked')
      )
      AND (
        ${strictRiderFilter}::text IS NULL
        OR (${strictRiderFilter} = 'female' AND LOWER(rp.gender) IN ('female','woman'))
        OR (${strictRiderFilter} = 'male'   AND LOWER(rp.gender) IN ('male','man'))
      )
      AND (
        rp.driver_preference IS NULL
        OR rp.driver_preference IN ('no_preference','any')
        OR rp.driver_preference LIKE 'prefer_%'
        OR (rp.driver_preference IN ('women_only','female') AND ${driverGender} IN ('female','woman'))
        OR (rp.driver_preference IN ('men_only','male')     AND ${driverGender} IN ('male','man'))
      )
    ORDER BY u.created_at DESC
    LIMIT 60
  `;

  const config = await readHmuConfig();
  const dailyLimit = driverTier === 'hmu_first' ? config.capHmuFirstDaily : config.capFreeDaily;

  const counterRows = await sql`
    SELECT count FROM rate_limit_counters WHERE key = ${hmuCapKey(driverId)} LIMIT 1
  `;
  const sentToday = counterRows.length ? Number((counterRows[0] as { count: number }).count) : 0;

  return (
    <FindRidersClient
      riders={riders.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        handle: (r.handle as string) || '',
        homeAreas: Array.isArray(r.home_areas) ? (r.home_areas as string[]) : [],
        avatarUrl: (r.avatar_url as string) || (r.thumbnail_url as string) || null,
      }))}
      sentToday={sentToday}
      dailyLimit={dailyLimit}
      driverId={driverId}
      activeRideBanner={<ActiveRideBanner userId={driverId} />}
    />
  );
}
