// POST /api/blast/[id]/targets/[targetId]/hmu — driver action: I want this
// ride at the rider's price. Stripe gate enforced; returns 402 + onboarding
// URL if Stripe Connect missing. Owned by Stream B per contract §8.
// Gate 2.2 stub — implementation lands in Stream B (with Stream C wiring).

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
