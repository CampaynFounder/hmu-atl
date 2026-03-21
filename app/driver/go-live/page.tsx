import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import GoLiveClient from './go-live-client';

export default async function GoLivePage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');

  const userRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/onboarding');
  const user = userRows[0] as { id: string; profile_type: string };
  if (user.profile_type !== 'driver') redirect('/rider/home');

  const profileRows = await sql`
    SELECT display_name, handle, areas FROM driver_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  if (!profileRows.length) redirect('/onboarding');
  const profile = profileRows[0] as { display_name: string; handle: string; areas: string[] };

  return (
    <GoLiveClient
      displayName={profile.display_name}
      handle={profile.handle}
      areas={Array.isArray(profile.areas) ? profile.areas : []}
    />
  );
}
