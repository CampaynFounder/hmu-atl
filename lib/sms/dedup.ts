// SMS deduplication — prevents the same nudge from being sent to the same
// user inside a configurable time window. Backed by the sms_log table that
// every send already writes to (lib/sms/textbee.ts:logSms), so this layer is
// read-only and adds no new write surface.
//
// Policy lives at the call site, not here:
//   - Bulk nudge filters the cohort and reports skip counts.
//   - Per-row send returns a 409 + lastSentAt so the UI can offer a confirm.
//   - Conversation agent scheduler can use it to suppress duplicate greetings.
//
// Default window (72h) was set with the founder during the activation refactor.

import { sql } from '@/lib/db/client';

export const DEFAULT_DEDUP_WINDOW_HOURS = 72;

export interface DedupCheckInput {
  userId: string;
  eventType: string;
  windowHours?: number;
}

export interface DedupCheckResult {
  recentlySent: boolean;
  // The most recent matching send, if any. UI can use this to show
  // "Last sent X hours ago" without a second round-trip.
  lastSentAt: string | null;
}

export async function wasRecentlySent({
  userId, eventType, windowHours = DEFAULT_DEDUP_WINDOW_HOURS,
}: DedupCheckInput): Promise<DedupCheckResult> {
  const rows = await sql`
    SELECT created_at
    FROM sms_log
    WHERE user_id = ${userId}
      AND event_type = ${eventType}
      AND status = 'sent'
      AND created_at > NOW() - (${windowHours} || ' hours')::interval
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const last = rows[0] as { created_at: string } | undefined;
  return {
    recentlySent: !!last,
    lastSentAt: last?.created_at ?? null,
  };
}

// Bulk version — given a list of (userId, eventType) tuples, returns the set
// of userIds that were recently sent the matching eventType. Used by the
// bulk-nudge route to filter the cohort in a single round-trip.
export async function findRecentlyNudged(
  userIds: string[],
  eventType: string,
  windowHours: number = DEFAULT_DEDUP_WINDOW_HOURS,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await sql`
    SELECT DISTINCT user_id
    FROM sms_log
    WHERE user_id = ANY(${userIds}::uuid[])
      AND event_type = ${eventType}
      AND status = 'sent'
      AND created_at > NOW() - (${windowHours} || ' hours')::interval
  ` as Array<{ user_id: string }>;
  return new Set(rows.map(r => r.user_id));
}
