// POST /api/blast/[id]/duplicate — return a prefilled draft from a prior blast
// so the rider can edit before re-sending. Owned by Stream B per contract §8.
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
