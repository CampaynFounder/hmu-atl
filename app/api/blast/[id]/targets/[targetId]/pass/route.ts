// POST /api/blast/[id]/targets/[targetId]/pass — driver action: not for me.
// Stripe gate enforced (§3 D-10) so the driver UI surfaces the inline overlay.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { writeBlastEvent, checkDriverPayoutGate } from '@/lib/blast/lifecycle';
import { broadcastBlastEvent } from '@/lib/blast/notify';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: blastId, targetId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverUserId = (userRows[0] as { id: string }).id;

  const rl = await checkRateLimit({
    key: `blast:pass:${driverUserId}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  const gate = await checkDriverPayoutGate(driverUserId);
  if (!gate.approved) {
    return NextResponse.json(
      { error: 'PAYOUT_ONBOARDING_REQUIRED', reason: gate.reason, payout_onboarding_url: '/driver/payout-setup' },
      { status: 402 },
    );
  }

  // Atomic — only first pass wins. Doesn't roll back hmu_at if already set
  // (a driver who HMU'd and then passed has unusual semantics; we treat the
  // first action as canonical to avoid undoing the rider's view).
  const updated = await sql`
    UPDATE blast_driver_targets
       SET passed_at = NOW()
     WHERE id = ${targetId}
       AND blast_id = ${blastId}
       AND driver_id = ${driverUserId}
       AND passed_at IS NULL
       AND selected_at IS NULL
       AND pull_up_at IS NULL
     RETURNING id, passed_at
  `;
  if (!updated.length) {
    return NextResponse.json(
      { error: 'CONFLICT', message: 'Target already responded' },
      { status: 409 },
    );
  }
  const row = updated[0] as { id: string; passed_at: string };

  void writeBlastEvent({
    blastId,
    driverId: driverUserId,
    eventType: 'pass',
    source: 'driver_action',
  });
  void broadcastBlastEvent(blastId, 'target_pass', {
    targetId: row.id,
    driverId: driverUserId,
    passedAt: row.passed_at,
  });

  return NextResponse.json({ passedAt: row.passed_at });
}
