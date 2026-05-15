// Blast lifecycle helpers — Stream B owned per docs/BLAST-V3-AGENT-CONTRACT.md §4.
//
// All blast state transitions go through these helpers so:
//   1. blast_driver_events stays the single funnel source-of-truth (§9)
//   2. driver_schedule_blocks (soft + hard) stay consistent
//   3. Stripe-gating logic for driver actions is centralized (§3 D-10)
//   4. Counter-price clamping (§3 D-2) is centralized
//
// This file is NEW. Extends — never replaces — the existing matching/notify
// machinery in lib/blast/{matching,internal-matcher,provider,notify}.ts.
//
// BANNED here per ESLint rule: sql.unsafe (see eslint.config.mjs).

import { sql } from '@/lib/db/client';
import type { BlastEventSource, BlastEventType } from './types';

// ============================================================================
// Event log writer
// ============================================================================

/**
 * Append a row to blast_driver_events. Fire-and-forget at callsites — never
 * block the matching/notification path on log writes (NFR-19, contract §9).
 */
export async function writeBlastEvent(opts: {
  blastId: string;
  driverId: string;
  eventType: BlastEventType;
  source: BlastEventSource;
  data?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO blast_driver_events (blast_id, driver_id, event_type, event_data, source)
      VALUES (
        ${opts.blastId},
        ${opts.driverId},
        ${opts.eventType},
        ${opts.data ? JSON.stringify(opts.data) : null}::jsonb,
        ${opts.source}
      )
    `;
  } catch (e) {
    // Swallow — event log writes are best-effort. Surface in logs only.
    console.error('[blast/lifecycle] writeBlastEvent failed:', e);
  }
}

// ============================================================================
// blast_match_log writer
// ============================================================================

/**
 * Persist the full candidate funnel for a blast — every (driver, blast) pair
 * the matcher considered, including ones that failed filters or didn't get
 * notified. Drives the /admin/blast/[id] observability page (Stream D).
 */
export async function writeMatchLog(opts: {
  blastId: string;
  candidates: Array<{
    driverId: string;
    rawFeatures: Record<string, number>;
    normalizedFeatures: Record<string, number>;
    filterResults: Array<{ filter: string; passed: boolean; value: unknown; threshold: unknown }>;
    score: number;
  }>;
  notifiedDriverIds: string[];
  configVersion: number;
  providerName: string;
  experimentArmId?: string | null;
}): Promise<void> {
  if (opts.candidates.length === 0) return;
  const notified = new Set(opts.notifiedDriverIds);
  // Run inserts in parallel — these are independent rows on a single table.
  // Cast each sql template result to a Promise so .catch() typing works
  // regardless of the underlying Neon serverless return type.
  const jobs = opts.candidates.map((c) =>
    (sql`
      INSERT INTO blast_match_log (
        blast_id, driver_id, raw_features, normalized_features,
        filter_results, score, was_notified, config_version, provider_name,
        experiment_arm_id
      ) VALUES (
        ${opts.blastId}, ${c.driverId},
        ${JSON.stringify(c.rawFeatures)}::jsonb,
        ${JSON.stringify(c.normalizedFeatures)}::jsonb,
        ${JSON.stringify(c.filterResults)}::jsonb,
        ${c.score},
        ${notified.has(c.driverId)},
        ${opts.configVersion},
        ${opts.providerName},
        ${opts.experimentArmId ?? null}
      )
    ` as Promise<unknown>).catch((e: unknown) => {
      console.error('[blast/lifecycle] writeMatchLog row failed:', e);
    }),
  );
  await Promise.all(jobs);
}

// ============================================================================
// Stripe driver gating (per contract §3 D-10)
// ============================================================================

export interface DriverPayoutGate {
  approved: boolean;
  reason?: 'no_stripe' | 'onboarding_incomplete' | 'account_inactive' | 'driver_not_found';
}

/**
 * Resolve whether a driver is allowed to ACT on a blast (HMU / counter / pass
 * actually move money). Drivers can RECEIVE blasts without Stripe (so the SMS
 * funnel keeps working pre-onboarding), but acting requires:
 *   1. driver_profiles.stripe_account_id IS NOT NULL
 *   2. driver_profiles.stripe_onboarding_complete = true
 *   3. users.account_status = 'active'
 *
 * Stream B exposes this so /api/blast/[id]/targets/[targetId]/{hmu,counter,pass}
 * all enforce the same check; Stream C reuses it for the inline overlay on
 * /d/b/[shortcode].
 */
export async function checkDriverPayoutGate(driverUserId: string): Promise<DriverPayoutGate> {
  const rows = await sql`
    SELECT
      u.account_status,
      dp.stripe_account_id,
      dp.stripe_onboarding_complete
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.id = ${driverUserId}
    LIMIT 1
  `;
  if (!rows.length) {
    return { approved: false, reason: 'driver_not_found' };
  }
  const r = rows[0] as {
    account_status: string | null;
    stripe_account_id: string | null;
    stripe_onboarding_complete: boolean | null;
  };
  if (r.account_status !== 'active') {
    return { approved: false, reason: 'account_inactive' };
  }
  if (!r.stripe_account_id) {
    return { approved: false, reason: 'no_stripe' };
  }
  if (!r.stripe_onboarding_complete) {
    return { approved: false, reason: 'onboarding_incomplete' };
  }
  return { approved: true };
}

// ============================================================================
// Counter-price clamping (per contract §3 D-2)
// ============================================================================

/**
 * Clamp a driver counter price to the per-market band [ask*(1-pct), ask*(1+pct)].
 * Returns the clamped value; callers decide whether to reject or accept clamps.
 */
export function clampCounterPrice(askDollars: number, counterDollars: number, maxPct: number): {
  clamped: number;
  wasClamped: boolean;
  min: number;
  max: number;
} {
  const safePct = Number.isFinite(maxPct) && maxPct > 0 ? maxPct : 0.25;
  const min = Math.round(askDollars * (1 - safePct) * 100) / 100;
  const max = Math.round(askDollars * (1 + safePct) * 100) / 100;
  if (!Number.isFinite(counterDollars)) {
    return { clamped: askDollars, wasClamped: true, min, max };
  }
  if (counterDollars < min) return { clamped: min, wasClamped: true, min, max };
  if (counterDollars > max) return { clamped: max, wasClamped: true, min, max };
  return { clamped: counterDollars, wasClamped: false, min, max };
}

// ============================================================================
// Schedule blocks
// ============================================================================

/**
 * Insert a calendar block for a driver while the blast lifecycle is mid-flight.
 *  - 'soft': rider tapped Select, 5min hold; released on pull-up or expiry.
 *  - 'hard': rider tapped Pull Up, payment captured; released only via ride
 *    state machine (cancel / complete).
 *
 * Window defaults: soft = 5 min from now; hard = 60 min from now (covers a
 * reasonable ride duration). Caller may override.
 */
export async function insertScheduleBlock(opts: {
  driverId: string;
  blastId: string;
  blockType: 'soft' | 'hard';
  blockedFrom?: Date;
  blockedUntil?: Date;
}): Promise<string> {
  const from = opts.blockedFrom ?? new Date();
  const defaultDurationMs = opts.blockType === 'soft' ? 5 * 60_000 : 60 * 60_000;
  const until = opts.blockedUntil ?? new Date(from.getTime() + defaultDurationMs);

  const rows = await sql`
    INSERT INTO driver_schedule_blocks (
      driver_id, blast_id, blocked_from, blocked_until, block_type
    ) VALUES (
      ${opts.driverId}, ${opts.blastId}, ${from}, ${until}, ${opts.blockType}
    )
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

/**
 * Release any open schedule blocks tied to (driver, blast). Used when the
 * 5-min soft hold expires without a pull-up, when the rider cancels pre-
 * pull-up, or when an alternate driver gets selected.
 */
export async function releaseScheduleBlocks(opts: {
  driverId?: string;
  blastId: string;
}): Promise<void> {
  if (opts.driverId) {
    await sql`
      UPDATE driver_schedule_blocks
         SET released_at = NOW()
       WHERE blast_id = ${opts.blastId}
         AND driver_id = ${opts.driverId}
         AND released_at IS NULL
    `;
  } else {
    await sql`
      UPDATE driver_schedule_blocks
         SET released_at = NOW()
       WHERE blast_id = ${opts.blastId}
         AND released_at IS NULL
    `;
  }
}

// ============================================================================
// Shortcode resolution
// ============================================================================

/**
 * Resolve a 7-char shortcode to the underlying blast (hmu_posts row). The
 * shortcode is stored in areas[0] as 'shortcode:XXXXXXX' per the existing
 * /api/blast route. Returns null on miss so callers can 404 cleanly.
 */
export async function resolveShortcode(shortcode: string): Promise<{
  id: string;
  user_id: string;
} | null> {
  if (!shortcode || shortcode.length < 4) return null;
  const rows = await sql`
    SELECT id, user_id
      FROM hmu_posts
     WHERE post_type = 'blast'
       AND areas[1] = ${`shortcode:${shortcode}`}
     LIMIT 1
  `;
  if (!rows.length) return null;
  const r = rows[0] as { id: string; user_id: string };
  return r;
}

// ============================================================================
// Per-target expiry (called by cron)
// ============================================================================

/**
 * Find every (blast, driver) target that was notified more than 15 minutes ago
 * and never responded (no hmu_at, counter_at, passed_at). Mark each one as
 * expired in the event log. Returns the rows touched so the caller can publish
 * to Ably.
 *
 * Idempotent: a cron worker can call this every minute without double-stamping
 * — we filter on existing 'expired' events via a NOT EXISTS subquery.
 */
export async function expireStaleTargets(opts: {
  windowMinutes?: number;
  limit?: number;
} = {}): Promise<Array<{ blastId: string; driverId: string; targetId: string }>> {
  const win = opts.windowMinutes ?? 15;
  const limit = opts.limit ?? 200;

  const rows = await sql`
    SELECT bdt.id AS target_id, bdt.blast_id, bdt.driver_id
      FROM blast_driver_targets bdt
     WHERE bdt.notified_at IS NOT NULL
       AND bdt.notified_at < NOW() - (${win} * INTERVAL '1 minute')
       AND bdt.hmu_at IS NULL
       AND bdt.passed_at IS NULL
       AND bdt.selected_at IS NULL
       AND bdt.pull_up_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM blast_driver_events e
          WHERE e.blast_id = bdt.blast_id
            AND e.driver_id = bdt.driver_id
            AND e.event_type = 'expired'
       )
     LIMIT ${limit}
  `;
  const result: Array<{ blastId: string; driverId: string; targetId: string }> = [];
  for (const r of rows) {
    const row = r as { target_id: string; blast_id: string; driver_id: string };
    await writeBlastEvent({
      blastId: row.blast_id,
      driverId: row.driver_id,
      eventType: 'expired',
      source: 'matcher',
      data: { reason: 'per_target_window_elapsed', windowMinutes: win },
    });
    result.push({ blastId: row.blast_id, driverId: row.driver_id, targetId: row.target_id });
  }
  return result;
}
