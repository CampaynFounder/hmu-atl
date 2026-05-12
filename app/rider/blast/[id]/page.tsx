// /rider/blast/[id] — live offer board. Spec §3.6.

import { isFeatureEnabled } from '@/lib/feature-flags';
import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { sql } from '@/lib/db/client';
import BlastOfferBoardClient from './blast-board-client';

export const dynamic = 'force-dynamic';

export default async function BlastOfferBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isFeatureEnabled('blast_booking'))) notFound();
  const { userId: clerkId } = await auth();
  const { id } = await params;
  if (!clerkId) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/rider/blast/${id}`)}`);

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const riderId = (userRows[0] as { id: string }).id;

  const ownerRows = await sql`
    SELECT 1 FROM hmu_posts WHERE id = ${id} AND post_type = 'blast' AND user_id = ${riderId} LIMIT 1
  `;
  if (!ownerRows.length) notFound();

  return <BlastOfferBoardClient blastId={id} />;
}
