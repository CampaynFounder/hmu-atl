// POST /api/blast/[id]/targets/[targetId]/counter — driver counter-offer at
// $Y instead of rider's ask. Counter price clamped to ±counterOfferMaxPct
// per contract §3 D-2. Owned by Stream B per contract §8.
// Gate 2.2 stub — implementation lands in Stream B.

import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json(
    { error: 'not_implemented_pending_stream_b' },
    { status: 501 },
  );
}
