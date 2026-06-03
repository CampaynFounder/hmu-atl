// Single source of truth for "a blast target is now visible to a driver."
//
// INVARIANT: A blast (hmu_posts.post_type='blast') ONLY surfaces in a driver's
// request feed once `blast_driver_targets.notified_at IS NOT NULL`. The driver
// feed query (GET /api/drivers/requests) hard-filters on that column. Therefore
// EVERY "rider chose this driver" code path MUST funnel through
// markBlastTargetNotified() so the stamp + the live feed push happen together.
//
// History: this used to be inlined in TWO sibling routes —
//   - POST /api/blast/[id]/hmu-fallback/[targetId]  (web rider deck)
//   - POST /api/blast/[id]/hmu/[targetId]           (mobile rider deck)
// They drifted: hmu-fallback stamped notified_at, /hmu never did, so blasts
// created/HMU'd from the mobile app never reached ANY driver feed (mobile or
// web). Consolidating the stamp here makes that drift impossible to reintroduce.

import { sql } from '@/lib/db/client';
import { notifyUser, publishToChannel } from '@/lib/ably/server';

export interface BlastTargetNotifyContext {
  blastId: string;
  targetId: string;
  driverId: string;
  priceDollars: number;
  pickupLabel: string;
  dropoffLabel: string;
  whenLabel?: string;
}

/**
 * Stamp `notified_at` on the target (idempotent) and fire the canonical
 * `blast_invite` push so the driver's feed refetches and shows the card. Also
 * moves the driver from "fallback" → "targeted" on the rider's live offer board
 * via `target_notified` on the blast channel.
 *
 * Callers may layer additional, channel-specific side effects (SMS provider,
 * a `blast_rider_hmu` highlight ping) on top — but the visibility contract
 * lives here and only here.
 */
export async function markBlastTargetNotified(ctx: BlastTargetNotifyContext): Promise<void> {
  // Idempotent: a second swipe on the same driver must not reset the timestamp
  // or double-notify. `AND notified_at IS NULL` makes repeat calls a no-op.
  await sql`
    UPDATE blast_driver_targets
       SET notified_at = NOW()
     WHERE id = ${ctx.targetId}
       AND notified_at IS NULL
  `;

  const when = ctx.whenLabel ? ` ${ctx.whenLabel}` : '';
  await notifyUser(ctx.driverId, 'blast_invite', {
    blastId: ctx.blastId,
    targetId: ctx.targetId,
    title: `New ride request — $${ctx.priceDollars}`,
    body: `${ctx.pickupLabel} → ${ctx.dropoffLabel}${when}`,
    url: '/driver/requests',
  }).catch((err) => console.error('[blast] notify driver feed failed:', err));

  await publishToChannel(`blast:${ctx.blastId}`, 'target_notified', {
    targetId: ctx.targetId,
    driverId: ctx.driverId,
    notifiedAt: new Date().toISOString(),
  }).catch((err) => console.error('[blast] offer-board target_notified failed:', err));
}
