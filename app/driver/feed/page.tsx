import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DriverFeedClient from './driver-feed-client';

export default async function DriverFeedPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) redirect('/onboarding?type=driver');

  const userId = (userRows[0] as { id: string }).id;

  const profileRows = await sql`
    SELECT handle, areas FROM driver_profiles WHERE user_id = ${userId} LIMIT 1
  `;
  if (!profileRows.length) redirect('/onboarding?type=driver');

  const driverAreas = (profileRows[0] as { areas: string[] }).areas || [];

  return <DriverFeedClient driverUserId={userId} driverAreas={driverAreas} />;
}
