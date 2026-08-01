// Seed user management — admin-created demo drivers & riders.
//
// A seed user is a REAL `users` row (is_seed=true, clerk_id=NULL) plus a
// driver_profiles / rider_profiles row, so it satisfies the existing browse
// eligibility WHERE clauses and shows up in the native feeds with no query
// changes. Seed users are excluded from real dispatch (blast matching +
// direct booking) in code — see lib/blast/matching.ts and lib/db/direct-bookings.ts.
//
// Deleting a seed user hard-deletes the `users` row; ON DELETE CASCADE removes
// its profile row and every comment where it is author OR subject (parent_id
// cascade takes nested replies), plus comment_reactions. Real users are never
// hard-deleted — this path is guarded by `AND is_seed = true`.

import { sql } from './client';
import { createDriverProfile, createRiderProfile } from './profiles';
import { normalizeHandle, isHandleTaken, HANDLE_ERROR } from '@/lib/profile/handle';

export type SeedRole = 'driver' | 'rider';

export interface SeedUserListItem {
  id: string;
  role: SeedRole;
  handle: string | null;
  display_name: string | null;
  gender: string | null;
  market_id: string | null;
  market_slug: string | null;
  photo_url: string | null;
  video_url: string | null;
  created_at: string;
}

export interface CreateSeedDriverParams {
  handle: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  market_id?: string | null;
  area_slugs?: string[];
  min_price?: number;
  lgbtq_friendly?: boolean;
  vehicle?: { make?: string; model?: string; year?: number; color?: string; photo_url?: string };
  video_url?: string;
  photo_url?: string;
}

export interface CreateSeedRiderParams {
  handle: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  market_id?: string | null;
  home_area_slug?: string | null;
  lgbtq_friendly?: boolean;
  video_url?: string;
  photo_url?: string;
}

/** Validate + normalize a handle for a brand-new seed user. Throws on failure. */
async function requireFreshHandle(raw: string): Promise<string> {
  const normalized = normalizeHandle(raw);
  if (!normalized) throw new Error(HANDLE_ERROR);
  // No owning user yet — pass a sentinel uuid so the "except" clause never matches.
  const taken = await isHandleTaken(normalized, '00000000-0000-0000-0000-000000000000');
  if (taken) throw new Error(`Handle @${normalized} is already taken`);
  return normalized;
}

/** Insert a bare seed `users` row and return its id. */
async function insertSeedUserRow(role: SeedRole, marketId: string | null): Promise<string> {
  const rows = await sql`
    INSERT INTO users (profile_type, account_status, chill_score, is_seed, market_id)
    VALUES (${role}, 'active', 100, true, ${marketId})
    RETURNING id
  `;
  return (rows[0] as { id: string }).id;
}

export async function createSeedDriver(params: CreateSeedDriverParams): Promise<{ id: string; handle: string }> {
  const handle = await requireFreshHandle(params.handle);
  const userId = await insertSeedUserRow('driver', params.market_id ?? null);

  await createDriverProfile({
    user_id: userId,
    first_name: params.first_name || params.display_name,
    last_name: params.last_name || '',
    display_name: params.display_name,
    handle,
    gender: params.gender,
    lgbtq_friendly: params.lgbtq_friendly ?? false,
    video_url: params.video_url,
    thumbnail_url: params.photo_url,
    area_slugs: params.area_slugs ?? [],
    pricing: params.min_price != null ? { minimum: params.min_price } : {},
    vehicle_info: {
      ...(params.vehicle ?? {}),
      ...(params.photo_url ? { photo_url: params.vehicle?.photo_url || params.photo_url } : {}),
    },
  });

  return { id: userId, handle };
}

export async function createSeedRider(params: CreateSeedRiderParams): Promise<{ id: string; handle: string }> {
  const handle = await requireFreshHandle(params.handle);
  const userId = await insertSeedUserRow('rider', params.market_id ?? null);

  await createRiderProfile({
    user_id: userId,
    first_name: params.first_name || params.display_name,
    last_name: params.last_name || '',
    display_name: params.display_name,
    gender: params.gender,
    lgbtq_friendly: params.lgbtq_friendly ?? false,
    video_url: params.video_url,
    thumbnail_url: params.photo_url,
    home_area_slug: params.home_area_slug ?? null,
  });

  // createRiderProfile doesn't set handle (riders get one via update path); set it now.
  await sql`UPDATE rider_profiles SET handle = ${handle}, avatar_url = COALESCE(${params.photo_url ?? null}, avatar_url) WHERE user_id = ${userId}`;

  return { id: userId, handle };
}

export async function listSeedUsers(): Promise<SeedUserListItem[]> {
  const rows = await sql`
    SELECT
      u.id,
      u.profile_type AS role,
      u.market_id,
      m.slug AS market_slug,
      u.created_at,
      COALESCE(dp.handle, rp.handle)             AS handle,
      COALESCE(dp.display_name, rp.display_name) AS display_name,
      COALESCE(dp.gender, rp.gender)             AS gender,
      COALESCE(dp.thumbnail_url, rp.thumbnail_url, rp.avatar_url) AS photo_url,
      COALESCE(dp.video_url, rp.video_url)       AS video_url
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.is_seed = true
    ORDER BY u.created_at DESC
  `;
  return rows as SeedUserListItem[];
}

/**
 * Collect the R2-hosted media URLs owned by a seed user so the caller (which
 * holds the MEDIA_BUCKET binding) can best-effort delete the objects.
 */
export async function getSeedUserMediaUrls(id: string): Promise<string[]> {
  const rows = await sql`
    SELECT dp.video_url AS dv, dp.thumbnail_url AS dt, dp.vibe_video_url AS dvb,
           rp.video_url AS rv, rp.thumbnail_url AS rt, rp.avatar_url AS ra, rp.vibe_video_url AS rvb
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    WHERE u.id = ${id} AND u.is_seed = true
    LIMIT 1
  `;
  if (!rows.length) return [];
  const r = rows[0] as Record<string, string | null>;
  return Object.values(r).filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/**
 * Hard-delete a seed user. Guarded by `is_seed = true` so a real user can never
 * be removed through this path. Returns true if a row was deleted.
 */
export async function deleteSeedUser(id: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM users WHERE id = ${id} AND is_seed = true RETURNING id
  `;
  return rows.length > 0;
}
