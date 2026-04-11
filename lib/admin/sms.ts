// Batch helpers for the admin_sms_sent audit log.
// Used by Live Ops and Growth drill-in sheets to render the "Texted Y/N" column
// and to sort untexted users first for outreach.

import { sql } from '@/lib/db/client';

export interface LastSentInfo {
  lastSentAt: Date;
  count: number;
}

// Batch lookup: returns a map of user_id → { lastSentAt, count } for every user
// that has at least one admin_sms_sent row. Users never texted are absent from
// the map so the caller can distinguish null vs. zero.
export async function getAdminSmsLastSent(userIds: string[]): Promise<Map<string, LastSentInfo>> {
  if (userIds.length === 0) return new Map();

  const rows = await sql`
    SELECT recipient_id, MAX(sent_at) AS last_sent_at, COUNT(*)::int AS count
    FROM admin_sms_sent
    WHERE recipient_id = ANY(${userIds}::uuid[])
    GROUP BY recipient_id
  `;

  const map = new Map<string, LastSentInfo>();
  for (const row of rows as Array<{ recipient_id: string; last_sent_at: string; count: number }>) {
    map.set(row.recipient_id, {
      lastSentAt: new Date(row.last_sent_at),
      count: row.count,
    });
  }
  return map;
}
