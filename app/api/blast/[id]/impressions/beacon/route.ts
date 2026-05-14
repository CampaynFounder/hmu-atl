// POST /api/blast/[id]/impressions/beacon — driver client beacon for
// feed_impression / detail-view events. Owned by Stream D per contract §8.
// Rate-limited 1/sec/driver per contract.
// Gate 2.2 stub — implementation lands in Stream D.

import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json(
    { error: 'not_implemented_pending_stream_d' },
    { status: 501 },
  );
}
