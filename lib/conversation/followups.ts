// Follow-up scheduler — scans active threads and enqueues the next follow-up
// when the persona's schedule says it's due. Called from the process-queue
// cron AFTER each drain pass.
//
// Rule: a thread needs follow-up #N when:
//   - status = 'active'
//   - messages_received = 0  (user never replied — we don't re-engage talkers)
//   - followups_sent < length(persona.follow_up_schedule_hours)
//   - last_outbound_at + (schedule[followups_sent] hours) <= NOW()
//   - no pending scheduled_outbound_messages row for this thread already
//
// After the last scheduled follow-up sends, drainQueue will flip the thread
// to 'dormant' (handled below via a separate pass on exhausted threads).

import { sql } from '@/lib/db/client';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { getConfig } from './config';
import { shiftOutOfQuietHours } from './scheduler';

const FLAG = 'conversation_agent';

export interface ScheduleFollowupsResult {
  scanned: number;
  queued: number;
  dormanted: number;
  reasons: Record<string, number>;
}

function bump(reasons: Record<string, number>, k: string) {
  reasons[k] = (reasons[k] ?? 0) + 1;
}

export async function scheduleDueFollowups(): Promise<ScheduleFollowupsResult> {
  const result: ScheduleFollowupsResult = { scanned: 0, queued: 0, dormanted: 0, reasons: {} };

  const flagOn = await isFeatureEnabled(FLAG);
  if (!flagOn) { bump(result.reasons, 'flag-off'); return result; }

  const config = await getConfig();

  // Find threads that could use another follow-up.
  const rows = (await sql`
    SELECT t.id, t.persona_id, t.phone, t.market_slug, t.followups_sent,
      t.last_outbound_at, t.messages_received,
      p.follow_up_schedule_hours, p.is_active AS persona_active, p.follow_up_template,
      p.quiet_hours_start, p.quiet_hours_end,
      u.opt_in_sms
    FROM conversation_threads t
    JOIN conversation_personas p ON p.id = t.persona_id
    JOIN users u ON u.id = t.user_id
    WHERE t.status = 'active'
      AND t.messages_received = 0
      AND t.last_outbound_at IS NOT NULL
      AND u.opt_in_sms = TRUE
      AND p.is_active = TRUE
      AND p.follow_up_template IS NOT NULL
    LIMIT 200
  `) as Array<{
    id: string;
    persona_id: string;
    phone: string;
    market_slug: string | null;
    followups_sent: number;
    last_outbound_at: Date;
    messages_received: number;
    follow_up_schedule_hours: number[];
    persona_active: boolean;
    follow_up_template: string | null;
    quiet_hours_start: string;
    quiet_hours_end: string;
    opt_in_sms: boolean;
  }>;

  result.scanned = rows.length;

  for (const t of rows) {
    const schedule = Array.isArray(t.follow_up_schedule_hours) ? t.follow_up_schedule_hours : [];
    if (t.followups_sent >= schedule.length) {
      // Exhausted — flip to dormant.
      await sql`UPDATE conversation_threads SET status = 'dormant', updated_at = NOW() WHERE id = ${t.id}`;
      result.dormanted++; bump(result.reasons, 'dormanted');
      continue;
    }

    const nextHours = schedule[t.followups_sent];
    if (!Number.isFinite(nextHours) || nextHours <= 0) { bump(result.reasons, 'bad-schedule'); continue; }

    const lastOutboundMs = new Date(t.last_outbound_at).getTime();
    const dueAtMs = lastOutboundMs + nextHours * 3_600_000;
    if (dueAtMs > Date.now()) { bump(result.reasons, 'not-due'); continue; }

    // Don't double-queue: skip if a pending outbound already exists.
    const pending = await sql`
      SELECT 1 FROM scheduled_outbound_messages
      WHERE thread_id = ${t.id} AND status = 'pending'
      LIMIT 1
    `;
    if (pending[0]) { bump(result.reasons, 'already-queued'); continue; }

    // Respect quiet hours — shift send_at to next valid window.
    const sendAtMs = shiftOutOfQuietHours(
      Date.now(),
      t.quiet_hours_start,
      t.quiet_hours_end,
      config.quiet_hours_enforced,
    );
    const sendAt = new Date(sendAtMs);

    await sql`
      INSERT INTO scheduled_outbound_messages (thread_id, kind, send_at, payload)
      VALUES (${t.id}, 'follow_up', ${sendAt.toISOString()}, ${JSON.stringify({ followup_index: t.followups_sent })}::jsonb)
    `;
    result.queued++; bump(result.reasons, 'queued');
  }

  return result;
}
