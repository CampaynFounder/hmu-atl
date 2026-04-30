// /driver/viewers — riders who have opened this driver's profile.
// Linked from the ViewsCard on /driver/home. Masked by default
// (consistent with HMU/Link rider directory); driver hits "Send HMU"
// to initiate contact, which uses the existing driver_to_rider_hmus
// rate-limited path.

import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { ViewersClient } from './viewers-client';

export const dynamic = 'force-dynamic';

export default async function DriverViewersPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const rows = await sql`
    SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (rows.length === 0) redirect('/sign-in');
  const user = rows[0] as { id: string; profile_type: string };
  if (user.profile_type !== 'driver' && user.profile_type !== 'both') {
    redirect('/');
  }

  return <ViewersClient />;
}
