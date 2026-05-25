import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DriverDownBadClient from './driver-down-bad-client';

export const dynamic = 'force-dynamic';

export default async function DriverDownBadPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in?returnTo=/driver/down-bad');

  const rows = await sql`
    SELECT u.id, dp.accepts_down_bad
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;

  if (!rows.length) redirect('/onboarding?type=driver');

  const { accepts_down_bad } = rows[0] as { accepts_down_bad: boolean };

  if (!accepts_down_bad) {
    redirect('/driver/profile?downbad=1');
  }

  return <DriverDownBadClient />;
}
