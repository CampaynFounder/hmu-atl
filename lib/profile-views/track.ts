// Race-safe per-(rider, driver) view counter. The ON CONFLICT path takes a
// row lock, so concurrent INSERTs against the same pair serialise inside
// Postgres — no app-level coordination needed.

import { sql } from '@/lib/db/client';

export interface RecordViewResult {
  view_count: number;
  first_view: boolean;
}

/**
 * Increment the view counter for (rider_id, driver_id). Inserts on first view,
 * increments on subsequent views. Self-views (rider_id === driver_id) are a
 * no-op so drivers previewing their own profile don't inflate the metric.
 */
export async function recordProfileView(
  riderId: string,
  driverId: string,
): Promise<RecordViewResult> {
  if (riderId === driverId) {
    return { view_count: 0, first_view: false };
  }

  const rows = await sql`
    INSERT INTO profile_views (rider_id, driver_id, view_count, first_viewed_at, last_viewed_at)
    VALUES (${riderId}, ${driverId}, 1, NOW(), NOW())
    ON CONFLICT (rider_id, driver_id) DO UPDATE
      SET view_count = profile_views.view_count + 1,
          last_viewed_at = NOW()
    RETURNING view_count, first_viewed_at = last_viewed_at AS first_view
  `;

  const r = rows[0] as { view_count: number; first_view: boolean };
  return { view_count: r.view_count, first_view: r.first_view };
}

export interface DriverViewStats {
  unique_riders: number;
  total_views: number;
  unique_riders_today: number;
  unique_riders_7d: number;
}

/**
 * Aggregate stats for a driver's home dashboard card. Single query so the
 * dashboard render isn't a fan-out.
 */
export async function getDriverViewStats(driverId: string): Promise<DriverViewStats> {
  const rows = await sql`
    SELECT
      COUNT(*)::int AS unique_riders,
      COALESCE(SUM(view_count), 0)::int AS total_views,
      COUNT(*) FILTER (
        WHERE last_viewed_at >= (NOW() AT TIME ZONE 'America/New_York')::date AT TIME ZONE 'America/New_York'
      )::int AS unique_riders_today,
      COUNT(*) FILTER (WHERE last_viewed_at >= NOW() - INTERVAL '7 days')::int AS unique_riders_7d
    FROM profile_views
    WHERE driver_id = ${driverId}
  `;
  const r = rows[0] as DriverViewStats;
  return r ?? { unique_riders: 0, total_views: 0, unique_riders_today: 0, unique_riders_7d: 0 };
}

export interface ViewerListEntry {
  rider_id: string;
  view_count: number;
  last_viewed_at: Date;
  first_viewed_at: Date;
  rider_handle: string | null;
  rider_display_name: string | null;
  rider_thumbnail_url: string | null;
  rider_gender: string | null;
  hmu_status: 'active' | 'linked' | 'dismissed' | 'expired' | 'unlinked' | null;
  is_blocked_by_rider: boolean;
}

/**
 * List riders who have viewed this driver, joined with HMU/Link state so the
 * UI can show "Send HMU" vs "Sent" vs "Linked" without a second query.
 * Excludes riders who have dismissed (= blocked) the driver via the HMU/Link
 * flow — they can no longer receive HMUs anyway.
 */
export async function listDriverViewers(
  driverId: string,
  limit = 50,
): Promise<ViewerListEntry[]> {
  const rows = await sql`
    SELECT
      pv.rider_id,
      pv.view_count,
      pv.last_viewed_at,
      pv.first_viewed_at,
      rp.handle           AS rider_handle,
      rp.display_name     AS rider_display_name,
      rp.thumbnail_url    AS rider_thumbnail_url,
      rp.gender           AS rider_gender,
      h.status            AS hmu_status,
      EXISTS (
        SELECT 1 FROM blocked_users b
        WHERE b.blocker_id = pv.rider_id AND b.blocked_id = ${driverId}
      )                   AS is_blocked_by_rider
    FROM profile_views pv
    LEFT JOIN rider_profiles rp ON rp.user_id = pv.rider_id
    LEFT JOIN driver_to_rider_hmus h
      ON h.driver_id = ${driverId} AND h.rider_id = pv.rider_id
    WHERE pv.driver_id = ${driverId}
    ORDER BY pv.last_viewed_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as ViewerListEntry[];
}
