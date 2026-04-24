import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { readHmuConfig, hmuCapKey } from '@/lib/hmu/helpers';
import { queryMaskedRiders } from '@/lib/hmu/find-riders-query';
import ActiveRideBanner from '@/components/driver/active-ride-banner';
import FindRidersClient from './find-riders-client';

export const dynamic = 'force-dynamic';

// Server pre-renders the first N cards so the page is usable before JS hydrates;
// the client pages the rest via /api/driver/find-riders/list.
const INITIAL_BATCH = 12;

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

  const riders = await queryMaskedRiders(
    {
      id: driverId,
      marketId: driverMarketId,
      gender: ((driver.driver_gender as string | null) || '').toLowerCase(),
      riderGenderPref: (driver.driver_rider_gender_pref as string | null) ?? null,
    },
    0,
    INITIAL_BATCH,
  );

  const config = await readHmuConfig();
  const dailyLimit = driverTier === 'hmu_first' ? config.capHmuFirstDaily : config.capFreeDaily;

  const counterRows = await sql`
    SELECT count FROM rate_limit_counters WHERE key = ${hmuCapKey(driverId)} LIMIT 1
  `;
  const sentToday = counterRows.length ? Number((counterRows[0] as { count: number }).count) : 0;

  return (
    <FindRidersClient
      initialRiders={riders}
      initialBatchSize={INITIAL_BATCH}
      sentToday={sentToday}
      dailyLimit={dailyLimit}
      driverId={driverId}
      activeRideBanner={<ActiveRideBanner userId={driverId} />}
    />
  );
}
