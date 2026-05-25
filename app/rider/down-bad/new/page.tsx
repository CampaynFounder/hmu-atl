import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import DownBadFormClient from './down-bad-form-client';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ driver?: string }>;
}

export default async function DownBadNewPage({ searchParams }: Props) {
  const { userId: clerkId } = await auth();
  const { driver: driverHandle } = await searchParams;
  if (!clerkId) redirect(`/sign-in?returnTo=/rider/down-bad/new${driverHandle ? `?driver=${driverHandle}` : ''}`);

  const rows = await sql`
    SELECT account_status FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!rows.length) redirect('/onboarding?type=rider');

  const { account_status } = rows[0] as { account_status: string };
  if (account_status !== 'active') redirect('/rider/home');

  // Verify that the targeted driver actually accepts Down Bad (defensive — the
  // CTA on their profile only appears when they do, but guard against direct URL nav).
  let targetDriverHandle: string | null = null;
  if (driverHandle) {
    const dpRows = await sql`
      SELECT dp.accepts_down_bad
      FROM driver_profiles dp
      WHERE dp.handle = ${driverHandle}
        AND dp.accepts_down_bad = true
      LIMIT 1
    `;
    if (dpRows.length) targetDriverHandle = driverHandle;
  }

  return <DownBadFormClient targetDriverHandle={targetDriverHandle} />;
}
