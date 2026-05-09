// Resolves a stale cancel_requested ride as a timeout (driver didn't
// respond). Called by:
//   - The rider's active-ride client when its countdown hits zero
//   - The driver's active-ride client when its countdown hits zero
//     (whichever fires first wins; second is idempotent)
//   - /api/cron/cancel-timeouts as a backstop every 5 minutes
//
// Both clients fire so we don't depend on either staying open. Server-side
// resolveCancelTimeout is the single source of truth — it owns the
// timeout-window check, the conditional UPDATE that claims resolution,
// the Stripe partial capture, the audit ledger insert, and the cascade.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveCancelTimeout } from '@/lib/rides/cancel-timeout';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rideId } = await params;

    // Cron backstop bypasses Clerk auth via shared header.
    const cronSecret = process.env.CRON_SECRET;
    const sentSecret = req.headers.get('x-cron-secret') || '';
    const isCron = !!cronSecret && sentSecret === cronSecret;

    if (!isCron) {
      const { userId: clerkId } = await auth();
      if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
      if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      const userId = (userRows[0] as { id: string }).id;

      // Verify caller is one of the parties on the ride (rider or driver).
      const partyRows = (await sql`
        SELECT 1 FROM rides
        WHERE id = ${rideId}
          AND (rider_id = ${userId} OR driver_id = ${userId})
        LIMIT 1
      `) as Array<unknown>;
      if (!partyRows.length) {
        return NextResponse.json({ error: 'Not a party on this ride' }, { status: 403 });
      }
    }

    const result = await resolveCancelTimeout(rideId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('cancel-request/timeout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve timeout' },
      { status: 500 }
    );
  }
}
