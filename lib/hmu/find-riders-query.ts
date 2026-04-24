// Shared query for the /driver/find-riders discovery surface.
// Called by both the initial server render (page.tsx) and the paginated
// /api/driver/find-riders/list endpoint, so one definition of "who shows up"
// stays enforced no matter how the cards get loaded.
//
// Privacy note: the fields returned here are intentionally the minimum a
// driver needs to decide whether to HMU. We DO return first_name/last_name
// so the masked card can show initials — that's less leaky than it sounds
// because rider first names already surface on other driver-facing surfaces
// (feed, ride details). If/when we tighten masking further, strip these.

import { sql } from '@/lib/db/client';

export interface FindRidersDriver {
  id: string;
  marketId: string | null;
  gender: string;
  riderGenderPref: string | null;
}

export interface MaskedRiderRow {
  id: string;
  handle: string;
  firstName: string;
  lastName: string;
  homeAreas: string[];
  avatarUrl: string | null;
  gender: string | null;
  driverPreference: string | null;
  lgbtqFriendly: boolean;
  completedRides: number;
}

export async function queryMaskedRiders(
  driver: FindRidersDriver,
  offset: number,
  limit: number,
): Promise<MaskedRiderRow[]> {
  const strictRiderFilter: 'female' | 'male' | null =
    driver.riderGenderPref === 'women_only' ? 'female' :
    driver.riderGenderPref === 'men_only' ? 'male' : null;

  const rows = await sql`
    SELECT u.id, u.completed_rides,
           rp.handle, rp.avatar_url, rp.thumbnail_url, rp.home_areas,
           rp.first_name, rp.last_name, rp.display_name,
           rp.driver_preference, rp.gender AS rider_gender,
           rp.lgbtq_friendly
    FROM users u
    JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.profile_type = 'rider'
      AND u.account_status = 'active'
      AND u.id <> ${driver.id}
      AND (${driver.marketId}::uuid IS NULL OR u.market_id = ${driver.marketId}::uuid)
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users b
        WHERE b.blocker_id = u.id AND b.blocked_id = ${driver.id}
      )
      AND NOT EXISTS (
        SELECT 1 FROM driver_to_rider_hmus h
        WHERE h.driver_id = ${driver.id} AND h.rider_id = u.id
          AND h.status IN ('active','linked')
      )
      AND (
        ${strictRiderFilter}::text IS NULL
        OR (${strictRiderFilter} = 'female' AND LOWER(rp.gender) IN ('female','woman'))
        OR (${strictRiderFilter} = 'male'   AND LOWER(rp.gender) IN ('male','man'))
      )
      AND (
        rp.driver_preference IS NULL
        OR rp.driver_preference IN ('no_preference','any')
        OR rp.driver_preference LIKE 'prefer_%'
        OR (rp.driver_preference IN ('women_only','female') AND ${driver.gender} IN ('female','woman'))
        OR (rp.driver_preference IN ('men_only','male')     AND ${driver.gender} IN ('male','man'))
      )
    ORDER BY u.created_at DESC
    OFFSET ${offset}
    LIMIT ${limit}
  `;

  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    handle: (r.handle as string) || '',
    firstName: (r.first_name as string) || (r.display_name as string) || '',
    lastName: (r.last_name as string) || '',
    homeAreas: Array.isArray(r.home_areas) ? (r.home_areas as string[]) : [],
    avatarUrl: (r.avatar_url as string) || (r.thumbnail_url as string) || null,
    gender: (r.rider_gender as string) || null,
    driverPreference: (r.driver_preference as string) || null,
    lgbtqFriendly: !!r.lgbtq_friendly,
    completedRides: Number(r.completed_rides ?? 0),
  }));
}
