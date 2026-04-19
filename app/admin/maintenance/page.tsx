import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getStateFresh, listWaitlist, getWaitlistStats } from '@/lib/maintenance';
import MaintenanceClient from './maintenance-client';

export default async function MaintenanceAdminPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/sign-in');
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || !(rows[0] as { is_admin: boolean }).is_admin) redirect('/');

  const [state, waitlist, stats] = await Promise.all([
    getStateFresh(),
    listWaitlist(),
    getWaitlistStats(),
  ]);

  return (
    <MaintenanceClient
      initialState={{
        ...state,
        expected_return_at: state.expected_return_at ? new Date(state.expected_return_at).toISOString() : null,
        updated_at: state.updated_at.toString(),
      }}
      initialWaitlist={waitlist.map(w => ({
        ...w,
        created_at: new Date(w.created_at).toISOString(),
        notified_at: w.notified_at ? new Date(w.notified_at).toISOString() : null,
      }))}
      initialStats={stats}
    />
  );
}
