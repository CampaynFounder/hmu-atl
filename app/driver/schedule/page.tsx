import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { redirect } from 'next/navigation';
import DriverScheduleClient from './driver-schedule-client';

export const metadata = { title: 'Schedule — HMU ATL' };

export default async function DriverSchedulePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`
    SELECT u.id, u.market_id, m.timezone, m.name as market_name
    FROM users u LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) redirect('/');
  const user = userRows[0] as { id: string; market_id: string; timezone: string; market_name: string };

  return <DriverScheduleClient userId={user.id} timezone={user.timezone || 'America/New_York'} marketName={user.market_name || 'ATL'} />;
}
