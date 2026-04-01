import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db/client';
import RiderSupportClient from './rider-support-client';

export const metadata = { title: 'Support — HMU ATL' };

export default async function RiderSupportPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`
    SELECT u.id, rp.display_name, rp.handle
    FROM users u JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) redirect('/');
  const user = userRows[0] as { id: string; display_name: string; handle: string };

  return <RiderSupportClient userName={user.handle || user.display_name || 'there'} />;
}
