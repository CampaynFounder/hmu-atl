import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db/client';
import DriverSupportClient from './driver-support-client';

export const metadata = { title: 'Support — HMU ATL' };

export default async function DriverSupportPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`
    SELECT u.id, dp.display_name, dp.handle
    FROM users u JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) redirect('/');
  const user = userRows[0] as { id: string; display_name: string; handle: string };

  return <DriverSupportClient userName={user.handle || user.display_name || 'Driver'} />;
}
