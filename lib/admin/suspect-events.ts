// Writer + reader for the suspect_usage_events audit log.
// Used by rate-limited routes (/api/chat/booking, booking create) to flag
// users whose behavior tripped a guard, and by /admin/suspect-usage to read.

import { sql } from '@/lib/db/client';

export type SuspectEventType =
  | 'chat_message_rate'
  | 'chat_open_rate'
  | 'booking_rate'
  | 'same_driver_booking_rate'
  | 'self_booking_attempt'
  | 'driver_booking_self_via_ui';

export async function logSuspectEvent(
  userId: string | null,
  eventType: SuspectEventType,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await sql`
      INSERT INTO suspect_usage_events (user_id, event_type, details)
      VALUES (${userId}, ${eventType}, ${JSON.stringify(details)})
    `;
  } catch (err) {
    // Audit failures must never break the request path.
    console.error('[SUSPECT_EVENT] failed to log:', err);
  }
}

export interface SuspectUsageSummary {
  userId: string;
  displayName: string | null;
  phone: string | null;
  profileType: string;
  totalEvents: number;
  lastEventAt: string;
  byType: Record<string, number>;
}

// Rollup for the admin page — one row per user with recent events.
export async function getSuspectUsageSummary(sinceDays: number = 7): Promise<SuspectUsageSummary[]> {
  // Two CTEs: per-user totals/last-hit, then per-user-per-type counts aggregated
  // into a jsonb object. Joined at the end for profile display fields.
  const rows = await sql`
    WITH events AS (
      SELECT user_id, event_type, created_at
      FROM suspect_usage_events
      WHERE user_id IS NOT NULL
        AND created_at > NOW() - (${sinceDays}::int * INTERVAL '1 day')
    ),
    per_user AS (
      SELECT user_id, COUNT(*)::int AS total_events, MAX(created_at) AS last_event_at
      FROM events
      GROUP BY user_id
    ),
    per_type AS (
      SELECT user_id, jsonb_object_agg(event_type, cnt) AS by_type
      FROM (
        SELECT user_id, event_type, COUNT(*)::int AS cnt
        FROM events
        GROUP BY user_id, event_type
      ) s
      GROUP BY user_id
    )
    SELECT
      pu.user_id,
      pu.total_events,
      pu.last_event_at,
      pt.by_type,
      u.profile_type,
      COALESCE(rp.display_name, dp.display_name) AS display_name,
      COALESCE(rp.phone, dp.phone) AS phone
    FROM per_user pu
    JOIN per_type pt ON pt.user_id = pu.user_id
    JOIN users u ON u.id = pu.user_id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    ORDER BY pu.last_event_at DESC
  `;

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    userId: String(r.user_id),
    displayName: (r.display_name as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    profileType: String(r.profile_type),
    totalEvents: Number(r.total_events),
    lastEventAt: new Date(r.last_event_at as string).toISOString(),
    byType: (r.by_type as Record<string, number>) || {},
  }));
}
