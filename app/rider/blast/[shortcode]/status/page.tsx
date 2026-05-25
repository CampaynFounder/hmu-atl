// /rider/blast/[shortcode]/status — blast status board.
// Shows drivers the rider has already contacted (swiped right on) and their
// responses. Ably keeps it live; rider gets a toast when a driver HMUs back.

import { isFeatureEnabled } from '@/lib/feature-flags';
import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { sql } from '@/lib/db/client';
import { resolveShortcode } from '@/lib/blast/lifecycle';
import BlastStatusClient from './blast-status-client';

export const dynamic = 'force-dynamic';

export default async function BlastStatusPage({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}) {
  if (!(await isFeatureEnabled('blast_booking'))) notFound();

  const { shortcode } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/rider/blast/${shortcode}/status`)}`);
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const riderId = (userRows[0] as { id: string }).id;

  const blast = await resolveShortcode(shortcode);
  if (!blast) notFound();
  if (blast.user_id !== riderId) notFound();

  return <BlastStatusClient blastId={blast.id} shortcode={shortcode} />;
}
