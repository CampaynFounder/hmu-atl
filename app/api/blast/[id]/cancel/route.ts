// POST /api/blast/[id]/cancel — rider cancels an in-flight blast.
// Releases the deposit hold. Notifies any drivers who'd HMU'd that the
// rider walked.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { stripe } from '@/lib/stripe/connect';
import { publishToChannel, notifyUser } from '@/lib/ably/server';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  // Atomic state transition: only an active blast can be cancelled.
  const claim = await sql`
    UPDATE hmu_posts
       SET status = 'cancelled'
     WHERE id = ${blastId}
       AND user_id = ${riderId}
       AND post_type = 'blast'
       AND status = 'active'
     RETURNING id, deposit_payment_intent_id
  `;
  if (!claim.length) {
    return NextResponse.json({ error: 'Blast not active' }, { status: 404 });
  }
  const post = claim[0] as { id: string; deposit_payment_intent_id: string | null };

  // Release the deposit hold.
  if (post.deposit_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(
        post.deposit_payment_intent_id,
        {},
        { idempotencyKey: `blast_cancel_${blastId}` },
      );
    } catch (e) {
      console.error('[blast] cancel deposit failed:', e);
      // Non-fatal — refund will be handled manually if needed.
    }
  }

  // Tell the offer board to close.
  publishToChannel(`blast:${blastId}`, 'cancelled', { blastId }).catch(() => {});

  // Tell HMU'd drivers their request is gone.
  const interestedRows = await sql`
    SELECT driver_id FROM blast_driver_targets
    WHERE blast_id = ${blastId} AND hmu_at IS NOT NULL
  `;
  for (const r of interestedRows) {
    notifyUser((r as { driver_id: string }).driver_id, 'blast_cancelled', { blastId }).catch(() => {});
  }

  return NextResponse.json({ cancelled: true });
}
