import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { listFbGroups } from '@/lib/db/fb-groups';
import FbGroupsClient from './fb-groups-client';

export default async function FbGroupsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');

  const groups = await listFbGroups();
  return <FbGroupsClient initialGroups={groups.map(g => ({
    ...g,
    created_at: g.created_at.toString(),
    updated_at: g.updated_at.toString(),
  }))} />;
}
