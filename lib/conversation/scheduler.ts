// Scheduler — creates threads + enqueues outbound, drains the queue honoring
// feature flag, opt-in, quiet hours, persona match, and per-persona caps.

import { sql } from '@/lib/db/client';
import { sendSms } from '@/lib/sms/textbee';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getConfig } from './config';
import { pickPersonaForUser, getPersonaById, type ConversationPersona } from './personas';

const FLAG = 'conversation_agent';

// ────────────────────────────────────────────────────────────────────
// Quiet hours — compute "send_at" shifted out of quiet window if needed.
// All reasoning happens in ET. Handles wrap-around (21:00 → 09:00 next day).
// ────────────────────────────────────────────────────────────────────

function parseHM(hm: string): { h: number; m: number } {
  const parts = hm.split(':');
  return { h: Number(parts[0] || 0), m: Number(parts[1] || 0) };
}

// Returns minute-of-day in the America/New_York wall clock for a given UTC ms.
function etMinutes(utcMs: number): number {
  // Intl trick to get ET parts without pulling a TZ lib.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const h = Number(parts.find(p => p.type === 'hour')?.value || '0');
  const m = Number(parts.find(p => p.type === 'minute')?.value || '0');
  return h * 60 + m;
}

// Convert an ET wall-clock HH:MM on the same ET day as `utcMs` into a UTC ms.
// Used to compute "next 9:00 ET" after a given instant.
function etHmToUtcMs(utcMs: number, hm: string, addDays = 0): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(utcMs + addDays * 86_400_000));
  const y = parts.find(p => p.type === 'year')!.value;
  const mo = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  const { h, m } = parseHM(hm);
  // Build an ISO string in ET and let Date parse it via offset trick.
  // ET is UTC-4 (EDT) or UTC-5 (EST) — we compute the offset by diffing.
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), h, m, 0);
  const etMinsAtThatMoment = etMinutes(asUtc);
  const targetMins = h * 60 + m;
  // Difference (in minutes) between what we intended in ET and what asUtc resolves to in ET.
  const driftMins = targetMins - etMinsAtThatMoment;
  return asUtc - driftMins * 60_000;
}

// Given a desired send time (UTC ms) and quiet-hours window in ET, return
// the first moment >= desired that is OUTSIDE quiet hours.
export function shiftOutOfQuietHours(
  desiredUtcMs: number,
  quietStart: string,
  quietEnd: string,
  enforced: boolean,
): number {
  if (!enforced) return desiredUtcMs;

  const start = parseHM(quietStart);
  const end = parseHM(quietEnd);
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;
  const nowEtMin = etMinutes(desiredUtcMs);

  const inWindow = startMin <= endMin
    ? (nowEtMin >= startMin && nowEtMin < endMin)                  // non-wrap (e.g. 13:00–15:00)
    : (nowEtMin >= startMin || nowEtMin < endMin);                 // wrap (e.g. 21:00–09:00)

  if (!inWindow) return desiredUtcMs;

  // We're in quiet hours — shift to `end` time. If wrap and we're past midnight
  // but before end, target is TODAY's end. Otherwise it's TOMORROW's end.
  if (startMin <= endMin) {
    return etHmToUtcMs(desiredUtcMs, quietEnd, 0);
  }
  if (nowEtMin < endMin) {
    return etHmToUtcMs(desiredUtcMs, quietEnd, 0);
  }
  return etHmToUtcMs(desiredUtcMs, quietEnd, 1);
}

// ────────────────────────────────────────────────────────────────────
// Scheduling — called from Clerk webhook after Neon user row is created.
// Never throws; returns reason string on skip.
// ────────────────────────────────────────────────────────────────────

export type ScheduleResult =
  | { scheduled: true; threadId: string; sendAt: Date }
  | { scheduled: false; reason: string };

export interface ScheduleInput {
  userId: string;
  phone: string;
  profileType: 'driver' | 'rider' | 'admin';
  gender: string | null;
  marketSlug?: string | null;
}

export async function scheduleFirstMessageForUser(input: ScheduleInput): Promise<ScheduleResult> {
  try {
    const flagOn = await isFeatureEnabled(FLAG, { userId: input.userId });
    if (!flagOn) return { scheduled: false, reason: 'flag-off' };

    if (input.profileType === 'admin') return { scheduled: false, reason: 'admin-user' };

    // Re-check opt-in from the DB (source of truth) — input may be stale.
    const userRows = await sql`SELECT opt_in_sms FROM users WHERE id = ${input.userId} LIMIT 1`;
    const user = userRows[0] as { opt_in_sms: boolean } | undefined;
    if (!user) return { scheduled: false, reason: 'user-not-found' };
    if (!user.opt_in_sms) return { scheduled: false, reason: 'opt-in-false' };

    // Don't double-schedule if a thread already exists for this user.
    const existing = await sql`SELECT id FROM conversation_threads WHERE user_id = ${input.userId} LIMIT 1`;
    if (existing[0]) return { scheduled: false, reason: 'thread-exists' };

    const persona = await pickPersonaForUser(input.gender, input.profileType);
    if (!persona) return { scheduled: false, reason: 'no-matching-persona' };

    const config = await getConfig();
    const delayMs = Math.max(0, config.first_message_delay_minutes) * 60_000;
    const desiredSendUtcMs = Date.now() + delayMs;
    const sendUtcMs = shiftOutOfQuietHours(
      desiredSendUtcMs,
      persona.quiet_hours_start,
      persona.quiet_hours_end,
      config.quiet_hours_enforced,
    );
    const sendAt = new Date(sendUtcMs);

    const threadRows = await sql`
      INSERT INTO conversation_threads (user_id, persona_id, status, phone, market_slug)
      VALUES (${input.userId}, ${persona.id}, 'pending', ${input.phone}, ${input.marketSlug ?? null})
      RETURNING id
    `;
    const threadId = (threadRows[0] as { id: string }).id;

    await sql`
      INSERT INTO scheduled_outbound_messages (thread_id, kind, send_at, payload)
      VALUES (${threadId}, 'greeting', ${sendAt.toISOString()}, ${JSON.stringify({ persona_slug: persona.slug })}::jsonb)
    `;

    return { scheduled: true, threadId, sendAt };
  } catch (err) {
    console.error('[conversation/scheduler] scheduleFirstMessageForUser failed:', err);
    return { scheduled: false, reason: 'error' };
  }
}

// ────────────────────────────────────────────────────────────────────
// Queue drain — called from 1-minute cron.
// Picks up due messages, picks best persona if not specified, sends, logs.
// ────────────────────────────────────────────────────────────────────

interface DueMessage {
  id: string;
  thread_id: string;
  kind: 'greeting' | 'follow_up' | 'vision';
  send_at: Date;
  payload: Record<string, unknown>;
  attempts: number;
}

interface ThreadSnapshot {
  id: string;
  user_id: string;
  persona_id: string;
  status: string;
  phone: string;
  opt_in_sms: boolean;
  messages_sent: number;
  market_slug: string | null;
}

export interface DrainResult {
  scanned: number;
  sent: number;
  skipped: number;
  deferred: number;
  failed: number;
  reasons: Record<string, number>;
}

function bump(reasons: Record<string, number>, k: string) {
  reasons[k] = (reasons[k] ?? 0) + 1;
}

export async function drainQueue(limit = 50): Promise<DrainResult> {
  const result: DrainResult = { scanned: 0, sent: 0, skipped: 0, deferred: 0, failed: 0, reasons: {} };

  const flagOn = await isFeatureEnabled(FLAG);
  if (!flagOn) { bump(result.reasons, 'flag-off'); return result; }

  const due = (await sql`
    SELECT id, thread_id, kind, send_at, payload, attempts
    FROM scheduled_outbound_messages
    WHERE status = 'pending' AND send_at <= NOW()
    ORDER BY send_at ASC
    LIMIT ${limit}
  `) as DueMessage[];
  result.scanned = due.length;
  if (due.length === 0) return result;

  const config = await getConfig();

  for (const msg of due) {
    try {
      const threadRows = await sql`
        SELECT t.id, t.user_id, t.persona_id, t.status, t.phone, t.messages_sent, t.market_slug,
          u.opt_in_sms
        FROM conversation_threads t
        JOIN users u ON u.id = t.user_id
        WHERE t.id = ${msg.thread_id}
        LIMIT 1
      `;
      const thread = threadRows[0] as ThreadSnapshot | undefined;

      if (!thread) {
        await markProcessed(msg.id, 'failed', 'thread-not-found');
        result.failed++; bump(result.reasons, 'thread-not-found');
        continue;
      }

      if (thread.status === 'opted_out' || thread.status === 'closed') {
        await markProcessed(msg.id, 'cancelled', thread.status);
        result.skipped++; bump(result.reasons, thread.status);
        continue;
      }

      if (!thread.opt_in_sms) {
        await markProcessed(msg.id, 'cancelled', 'opt-in-false');
        result.skipped++; bump(result.reasons, 'opt-in-false');
        continue;
      }

      const persona = await getPersonaById(thread.persona_id);
      if (!persona || !persona.is_active) {
        await markProcessed(msg.id, 'cancelled', 'persona-inactive');
        result.skipped++; bump(result.reasons, 'persona-inactive');
        continue;
      }

      // Cap: stop outbound once persona max messages hit (unless it's the vision follow-up).
      if (thread.messages_sent >= persona.max_messages_per_thread) {
        await markProcessed(msg.id, 'cancelled', 'cap-reached');
        result.skipped++; bump(result.reasons, 'cap-reached');
        continue;
      }

      // Re-check quiet hours at send time — if we missed the window, defer.
      const nowMs = Date.now();
      const shifted = shiftOutOfQuietHours(
        nowMs,
        persona.quiet_hours_start,
        persona.quiet_hours_end,
        config.quiet_hours_enforced,
      );
      if (shifted > nowMs) {
        await sql`
          UPDATE scheduled_outbound_messages
          SET send_at = ${new Date(shifted).toISOString()}, attempts = ${msg.attempts + 1}
          WHERE id = ${msg.id}
        `;
        result.deferred++; bump(result.reasons, 'deferred-quiet-hours');
        continue;
      }

      const body = renderMessageBody(msg.kind, persona);
      if (!body) {
        await markProcessed(msg.id, 'cancelled', 'empty-body');
        result.skipped++; bump(result.reasons, 'empty-body');
        continue;
      }

      const sendResult = await sendSms(thread.phone, body, {
        userId: thread.user_id,
        eventType: `conversation_${msg.kind}`,
        market: thread.market_slug || 'atl',
      });

      if (!sendResult.success) {
        await sql`
          UPDATE scheduled_outbound_messages
          SET status = 'failed', attempts = ${msg.attempts + 1}, last_error = ${sendResult.error ?? 'unknown'}, processed_at = NOW()
          WHERE id = ${msg.id}
        `;
        await sql`
          INSERT INTO conversation_messages (thread_id, direction, body, generated_by, delivery_status, error_message)
          VALUES (${thread.id}, 'outbound', ${body}, 'template', 'failed', ${sendResult.error ?? 'unknown'})
        `;
        result.failed++; bump(result.reasons, 'send-failed');
        continue;
      }

      await sql`
        INSERT INTO conversation_messages (thread_id, direction, body, generated_by, delivery_status, voipms_id)
        VALUES (${thread.id}, 'outbound', ${body}, 'template', 'sent', ${sendResult.messageId ?? null})
      `;
      const isFollowUp = msg.kind === 'follow_up';
      await sql`
        UPDATE conversation_threads
        SET
          status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
          messages_sent = messages_sent + 1,
          followups_sent = followups_sent + ${isFollowUp ? 1 : 0},
          last_outbound_at = NOW(),
          updated_at = NOW()
        WHERE id = ${thread.id}
      `;
      await markProcessed(msg.id, 'sent', null);

      // Optional: queue follow-ups after the first greeting (phase 3+ turns on Claude replies
      // and will reschedule follow-ups dynamically). For Phase 2, only greeting sends.
      result.sent++; bump(result.reasons, msg.kind);
    } catch (err) {
      console.error('[conversation/scheduler] drain item failed:', msg.id, err);
      result.failed++; bump(result.reasons, 'exception');
      try {
        await sql`
          UPDATE scheduled_outbound_messages
          SET status = 'failed', attempts = ${msg.attempts + 1}, last_error = ${(err as Error)?.message ?? 'error'}, processed_at = NOW()
          WHERE id = ${msg.id}
        `;
      } catch { /* best-effort */ }
    }
  }

  return result;
}

function renderMessageBody(kind: DueMessage['kind'], persona: ConversationPersona): string | null {
  switch (kind) {
    case 'greeting': return persona.greeting_template;
    case 'vision':   return persona.vision_template || null;
    case 'follow_up': return persona.follow_up_template || persona.greeting_template;
    default: return null;
  }
}

async function markProcessed(id: string, status: 'sent' | 'failed' | 'cancelled', reason: string | null) {
  await sql`
    UPDATE scheduled_outbound_messages
    SET status = ${status}, processed_at = NOW(), last_error = ${reason}
    WHERE id = ${id}
  `;
}
