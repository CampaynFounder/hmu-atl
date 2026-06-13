import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import PartnerKeysClient from './partner-keys-client';

export const dynamic = 'force-dynamic';

export default async function PartnerKeysPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');
  return <PartnerKeysClient />;
}
