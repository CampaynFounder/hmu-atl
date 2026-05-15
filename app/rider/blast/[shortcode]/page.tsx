// /rider/blast/[shortcode] — v3 live offer board.
//
// Per docs/BLAST-V3-AGENT-CONTRACT.md §6.6 + §8. Shortcode-based URL is the
// canonical share/deep-link target — humans see "atl.hmucashride.com/r/b/HXJ23K9"
// not a UUID. Resolves shortcode → blast UUID server-side, owner-checks, then
// hands off to the client offer board.
//
// Coexists with the older /rider/blast/[id] route (preserves the existing
// rider-rides flow during the v3 rollout per contract §11.4 non-regression).

import { isFeatureEnabled } from '@/lib/feature-flags';
import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { sql } from '@/lib/db/client';
import { resolveShortcode } from '@/lib/blast/lifecycle';
import BlastOfferBoardClientV3 from './blast-board-v3-client';

export const dynamic = 'force-dynamic';

export default async function BlastOfferBoardV3Page({
  params,
}: {
  params: Promise<{ shortcode: string }>;
}) {
  if (!(await isFeatureEnabled('blast_booking'))) notFound();

  const { shortcode } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/rider/blast/${shortcode}`)}`);
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) redirect('/');
  const riderId = (userRows[0] as { id: string }).id;

  const blast = await resolveShortcode(shortcode);
  if (!blast) notFound();
  if (blast.user_id !== riderId) notFound();

  return <BlastOfferBoardClientV3 blastId={blast.id} shortcode={shortcode} />;
}
