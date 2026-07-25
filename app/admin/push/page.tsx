import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getDemoUserHandles } from '@/lib/demo/handles';
import PushClient from './push-client';

export const dynamic = 'force-dynamic';

export default async function PushPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');

  // Preload the reviewer demo accounts for one-click targeting.
  const demo = await getDemoUserHandles();

  return <PushClient demo={demo} />;
}
