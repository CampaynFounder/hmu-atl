// POST /api/blast/[id]/targets/[targetId]/hmu — driver action: I want this
// ride at the rider's price. Per contract §3 D-10: drivers see + receive
// blasts without Stripe, but ACTING (HMU/counter/pass) requires Stripe Connect
// + onboarding-complete + active account. Returns 402 + onboarding URL otherwise.
//
// Stamps blast_driver_targets.hmu_at (idempotent — no-op on second tap),
// writes a blast_driver_events 'hmu' row, and broadcasts target_hmu on the
// rider's blast:{id} Ably channel so the offer board card glides in.
//
// Non-regression: no edits to existing matching/notify pipeline. Reuses
// lifecycle.checkDriverPayoutGate() — same gate Stream C will use.
//
// PostHog: emits blast_target_hmu (server-side via the event log; client UI
// also emits the user-facing event).

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

  const userRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverUserId = (userRows[0] as { id: string }).id;

  // Light rate-limit so a stuck client double-tap doesn't fan out events.
  const rl = await checkRateLimit({
    key: `blast:hmu:${driverUserId}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  // Stripe gate. Per contract §3 D-10 we return 402 with the payout-onboarding
  // URL so the driver UI shows an inline overlay instead of a hidden button.
  const gate = await checkDriverPayoutGate(driverUserId);
  if (!gate.approved) {
    return NextResponse.json(
      { error: 'PAYOUT_ONBOARDING_REQUIRED', reason: gate.reason, payout_onboarding_url: '/driver/payout-setup' },
      { status: 402 },
    );
  }

  // Confirm the target row belongs to this driver + this blast and the blast
  // is still active. Atomic UPDATE prevents racing two responses on the same
  // target — second call hits the IS NULL guard and no-ops back to caller.
  const updated = await sql`
    UPDATE blast_driver_targets
       SET hmu_at = NOW(),
           passed_at = NULL
     WHERE id = ${targetId}
       AND blast_id = ${blastId}
       AND driver_id = ${driverUserId}
       AND hmu_at IS NULL
       AND passed_at IS NULL
       AND selected_at IS NULL
       AND pull_up_at IS NULL
     RETURNING id, hmu_at, match_score
  `;

  if (!updated.length) {
    // Either the target is gone, the driver already responded, or it was
    // already selected. Surface the current state so the client can reconcile.
    const cur = await sql`
      SELECT hmu_at, passed_at, selected_at, pull_up_at
        FROM blast_driver_targets
       WHERE id = ${targetId} AND driver_id = ${driverUserId}
       LIMIT 1
    `;
    if (!cur.length) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }
    const row = cur[0] as Record<string, unknown>;
    if (row.hmu_at) {
      return NextResponse.json({ hmuAt: row.hmu_at, idempotent: true });
    }
    return NextResponse.json(
      { error: 'CONFLICT', message: 'Target no longer accepting HMU', state: row },
      { status: 409 },
    );
  }

  const target = updated[0] as { id: string; hmu_at: string; match_score: number };

  // Driver info for the offer-board card payload.
  const driverRows = await sql`
    SELECT u.id, dp.handle, dp.display_name, dp.video_url, dp.vehicle_info,
           u.chill_score, u.tier
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
     WHERE u.id = ${driverUserId}
     LIMIT 1
  `;
  const driver = driverRows[0] as Record<string, unknown> | undefined;

  // Funnel event log + rider-facing realtime — both fire-and-forget so the
  // HTTP response stays snappy.
  void writeBlastEvent({
    blastId,
    driverId: driverUserId,
    eventType: 'hmu',
    source: 'driver_action',
    data: { matchScore: Number(target.match_score) },
  });
  void broadcastBlastEvent(blastId, 'target_hmu', {
    targetId: target.id,
    blastId,
    driverId: driverUserId,
    matchScore: Number(target.match_score),
    hmuAt: target.hmu_at,
    counterPrice: null,
    passedAt: null,
    selectedAt: null,
    rejectedAt: null,
    driver: driver
      ? {
          handle: driver.handle,
          displayName: driver.display_name,
          videoUrl: driver.video_url,
          vehicle: driver.vehicle_info,
          chillScore: Number(driver.chill_score ?? 0),
          tier: driver.tier,
        }
      : null,
  });

  return NextResponse.json({ hmuAt: target.hmu_at });
}
