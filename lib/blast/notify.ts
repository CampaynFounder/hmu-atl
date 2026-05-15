// Blast notification fanout — push (Ably) + SMS (voip.ms) per driver target.
//
// Gating order (each layer can opt out the send):
//   1. driver_blast_preferences.blasts_enabled
//   2. driver_blast_preferences.push_enabled / sms_enabled
//   3. quiet_hours (driver-local)
//   4. min_fare_threshold per driver
//   5. max_blasts_per_day per driver (counted from blast_driver_targets)
//   6. global blast.sms_kill_switch (SMS-only, push always tries)
//   7. blast.max_sms_per_blast hard ceiling
//
// Push is fire-and-forget (Ably). SMS is await'd within the per-driver loop
// because we need to count actual sends against MAX_SMS_PER_BLAST. The whole
// fanout runs inside ctx.waitUntil() at the API layer so the HTTP response
// doesn't wait on it.

import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { notifyUser, publishToChannel } from '@/lib/ably/server';
import { getKnob } from './config';
import { writeBlastEvent } from './lifecycle';

export interface BlastTarget {
  targetId: string; // blast_driver_targets.id
  driverId: string;
  matchScore: number;
  distanceMi: number;
}

export interface BlastNotificationContext {
  blastId: string;
  riderDisplayName: string;
  pickupLabel: string; // short label for SMS, e.g. "West End"
  dropoffLabel: string;
  priceDollars: number;
  scheduledForLabel: string; // "now" | "in 20 min" | "tonight 8pm"
  marketSlug: string;
  shortcode: string; // for the /d/b/{shortcode} SMS link
}

interface DriverPrefRow {
  user_id: string;
  blasts_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  max_blasts_per_day: number;
  min_fare_threshold: number | null;
  phone: string | null;
  sent_today: number;
}

const DEFAULT_MAX_BLASTS_PER_DAY = 20;

function inQuietHours(start: string | null, end: string | null, now: Date): boolean {
  if (!start || !end) return false;
  // Driver timezone tracking is a Phase 2 nicety; for v1 we evaluate quiet
  // hours in market-local. ATL is ET; this is fine for the launch market.
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const minutes = local.getHours() * 60 + local.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (startMin < endMin) return minutes >= startMin && minutes < endMin;
  // Window crosses midnight (e.g., 22:00–07:00)
  return minutes >= startMin || minutes < endMin;
}

async function loadDriverPrefs(driverIds: string[]): Promise<Map<string, DriverPrefRow>> {
  if (driverIds.length === 0) return new Map();
  // Lazy-init: missing rows fall back to "default ON" via COALESCE.
  // sent_today counts blasts notified to this driver today (across all riders).
  const rows = await sql`
    SELECT
      u.id AS user_id,
      COALESCE(p.blasts_enabled, TRUE) AS blasts_enabled,
      COALESCE(p.push_enabled, TRUE) AS push_enabled,
      COALESCE(p.sms_enabled, TRUE) AS sms_enabled,
      p.quiet_hours_start::text AS quiet_hours_start,
      p.quiet_hours_end::text AS quiet_hours_end,
      COALESCE(p.max_blasts_per_day, ${DEFAULT_MAX_BLASTS_PER_DAY}) AS max_blasts_per_day,
      p.min_fare_threshold,
      dp.phone,
      COALESCE(t.sent_today, 0) AS sent_today
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN driver_blast_preferences p ON p.user_id = u.id
    LEFT JOIN (
      SELECT driver_id, COUNT(*) AS sent_today
      FROM blast_driver_targets
      WHERE notified_at::date = (NOW() AT TIME ZONE 'America/New_York')::date
      GROUP BY driver_id
    ) t ON t.driver_id = u.id
    WHERE u.id = ANY(${driverIds}::uuid[])
  `;

  const map = new Map<string, DriverPrefRow>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    map.set(row.user_id as string, {
      user_id: row.user_id as string,
      blasts_enabled: Boolean(row.blasts_enabled),
      push_enabled: Boolean(row.push_enabled),
      sms_enabled: Boolean(row.sms_enabled),
      quiet_hours_start: (row.quiet_hours_start as string) ?? null,
      quiet_hours_end: (row.quiet_hours_end as string) ?? null,
      max_blasts_per_day: Number(row.max_blasts_per_day),
      min_fare_threshold: row.min_fare_threshold !== null ? Number(row.min_fare_threshold) : null,
      phone: (row.phone as string) ?? null,
      sent_today: Number(row.sent_today),
    });
  }
  return map;
}

function buildSmsBody(ctx: BlastNotificationContext): string {
  // Stay under 155 chars. Single market voice — no timezone abbreviations.
  const link = `atl.hmucashride.com/d/b/${ctx.shortcode}`;
  return `HMU ride request — $${ctx.priceDollars}, ${ctx.pickupLabel} → ${ctx.dropoffLabel} ${ctx.scheduledForLabel}. ${link} Reply STOP to opt out.`;
}

function pushPayload(target: BlastTarget, ctx: BlastNotificationContext) {
  return {
    blastId: ctx.blastId,
    targetId: target.targetId,
    title: `New ride request — $${ctx.priceDollars}`,
    body: `${ctx.pickupLabel} → ${ctx.dropoffLabel} ${ctx.scheduledForLabel}`,
    url: `/driver/home?blast=${ctx.blastId}`,
    distanceMi: target.distanceMi,
    matchScore: target.matchScore,
  };
}

export interface FanoutResult {
  pushSent: number;
  smsSent: number;
  smsSkipped: number;
  pushSkipped: number;
  reasons: Record<string, number>;
}

/**
 * Fan out a blast to its targets. Idempotent at the per-target level via the
 * (blast_id, driver_id) UNIQUE constraint on blast_driver_targets — re-runs
 * on the same set just refresh `notification_channels`.
 */
export async function fanoutBlast(
  targets: BlastTarget[],
  ctx: BlastNotificationContext,
): Promise<FanoutResult> {
  const result: FanoutResult = {
    pushSent: 0,
    smsSent: 0,
    smsSkipped: 0,
    pushSkipped: 0,
    reasons: {},
  };
  const bump = (k: string) => {
    result.reasons[k] = (result.reasons[k] ?? 0) + 1;
  };

  if (targets.length === 0) return result;

  const [smsKillSwitch, maxSmsPerBlast] = await Promise.all([
    getKnob<boolean>('blast.sms_kill_switch', false),
    getKnob<number>('blast.max_sms_per_blast', 10),
  ]);

  const prefs = await loadDriverPrefs(targets.map((t) => t.driverId));
  const now = new Date();

  for (const target of targets) {
    const pref = prefs.get(target.driverId);
    const channels: string[] = [];

    if (!pref || !pref.blasts_enabled) {
      result.pushSkipped += 1;
      result.smsSkipped += 1;
      bump('blasts_disabled');
      // Funnel observability — record why this candidate dropped out.
      void writeBlastEvent({
        blastId: ctx.blastId,
        driverId: target.driverId,
        eventType: 'notify_skipped',
        source: 'notifier',
        data: { reason: 'blasts_disabled' },
      });
      continue;
    }

    // Eligibility passed gates — ready to send.
    void writeBlastEvent({
      blastId: ctx.blastId,
      driverId: target.driverId,
      eventType: 'notify_eligible',
      source: 'notifier',
      data: { matchScore: target.matchScore },
    });

    // ── Push leg ──
    if (pref.push_enabled) {
      try {
        await notifyUser(target.driverId, 'blast_invite', pushPayload(target, ctx));
        channels.push('push');
        result.pushSent += 1;
        void writeBlastEvent({
          blastId: ctx.blastId,
          driverId: target.driverId,
          eventType: 'push_sent',
          source: 'notifier',
        });
      } catch {
        result.pushSkipped += 1;
        bump('push_publish_failed');
      }
    } else {
      result.pushSkipped += 1;
      bump('push_disabled');
    }

    // ── SMS leg ──
    const canSms = (() => {
      if (smsKillSwitch) return ['kill_switch', false] as const;
      if (!pref.sms_enabled) return ['sms_disabled', false] as const;
      if (!pref.phone) return ['no_phone', false] as const;
      if (pref.sent_today >= pref.max_blasts_per_day) return ['daily_cap', false] as const;
      if (pref.min_fare_threshold && ctx.priceDollars < pref.min_fare_threshold) {
        return ['below_fare_floor', false] as const;
      }
      if (inQuietHours(pref.quiet_hours_start, pref.quiet_hours_end, now)) {
        return ['quiet_hours', false] as const;
      }
      if (result.smsSent >= maxSmsPerBlast) return ['blast_sms_ceiling', false] as const;
      return ['ok', true] as const;
    })();

    if (!canSms[1]) {
      result.smsSkipped += 1;
      bump(canSms[0]);
      void writeBlastEvent({
        blastId: ctx.blastId,
        driverId: target.driverId,
        eventType: 'notify_skipped',
        source: 'notifier',
        data: { reason: canSms[0], channel: 'sms' },
      });
    } else {
      const send = await sendSms(pref.phone!, buildSmsBody(ctx), {
        userId: target.driverId,
        eventType: 'blast_notification',
        market: ctx.marketSlug,
      });
      if (send.success) {
        channels.push('sms');
        result.smsSent += 1;
        void writeBlastEvent({
          blastId: ctx.blastId,
          driverId: target.driverId,
          eventType: 'sms_sent',
          source: 'notifier',
        });
      } else {
        result.smsSkipped += 1;
        bump('sms_send_failed');
        void writeBlastEvent({
          blastId: ctx.blastId,
          driverId: target.driverId,
          eventType: 'sms_failed',
          source: 'notifier',
          data: { error: send.error ?? 'unknown' },
        });
      }
    }

    // Persist which channels actually fired for this target (audit + admin).
    if (channels.length > 0) {
      await sql`
        UPDATE blast_driver_targets
           SET notification_channels = ${channels}
         WHERE id = ${target.targetId}
      `.catch(() => {});
    }
  }

  return result;
}

// ============================================================================
// Live offer-board broadcast helpers (Stream B)
// ============================================================================

/**
 * Push a target-level event onto the rider's blast:{id} channel so the offer
 * board reacts in real time. The board's Ably listener cases on `name`.
 *
 * Centralized here so all rider-facing realtime events (target_hmu, target_counter,
 * target_pass, target_expired, target_selected, target_rejected, match_locked,
 * blast_cancelled, blast_bumped) share a single call site.
 */
export async function broadcastBlastEvent(
  blastId: string,
  name:
    | 'target_hmu'
    | 'target_counter'
    | 'target_pass'
    | 'target_expired'
    | 'target_selected'
    | 'target_rejected'
    | 'match_locked'
    | 'blast_cancelled'
    | 'blast_bumped'
    | 'pull_up_started',
  data: Record<string, unknown>,
): Promise<void> {
  await publishToChannel(`blast:${blastId}`, name, data).catch((e) => {
    console.error(`[blast/notify] broadcast ${name} failed:`, e);
  });
}
