import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { listFeatureFlags } from '@/lib/feature-flags';
import FeatureFlagsClient from './feature-flags-client';

export default async function FeatureFlagsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');

  const flags = await listFeatureFlags();

  return <FeatureFlagsClient initialFlags={flags} />;
}
