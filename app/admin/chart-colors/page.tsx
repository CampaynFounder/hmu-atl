import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import ChartColorsClient from './chart-colors-client';

export const dynamic = 'force-dynamic';

export default async function ChartColorsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  // Super-only; the admin layout route guard also enforces this, the page-level
  // check is defense-in-depth.
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');
  return <ChartColorsClient />;
}
