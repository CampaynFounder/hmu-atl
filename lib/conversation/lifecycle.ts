// Lifecycle stage resolver — loads enough user state from Neon to classify a
// driver or rider into one of the canonical activation stages. Reuses the
// pure classifier in lib/admin/activation-checks.ts so the conversation agent
// and the /admin/activation dashboard agree on what stage a user is in.

import { sql } from '@/lib/db/client';
import {
  classifyDriverStage, classifyRiderStage, type LifecycleStage,
} from '@/lib/admin/activation-checks';

interface DriverStateRow {
  display_name: string | null;
  handle: string | null;
  area_slugs: string[] | null;
  services_entire_market: boolean | null;
  pricing: Record<string, unknown> | null;
  thumbnail_url: string | null;
  video_url: string | null;
  vehicle_info: Record<string, unknown> | null;
  stripe_onboarding_complete: boolean | null;
  last_sign_in_at: string | null;
  has_profile_row: boolean;
  has_posts: boolean;
}

interface RiderStateRow {
  display_name: string | null;
  thumbnail_url: string | null;
  avatar_url: string | null;
  has_payment_method: boolean;
  rides_completed_count: number;
  ride_requests_count: number;
  last_sign_in_at: string | null;
  has_profile_row: boolean;
}

// Returns null when the user is not a driver/rider or doesn't exist. The
// scheduler treats null as "no stage info" and picks an 'any'-stage persona.
export async function getUserLifecycleStage(userId: string): Promise<LifecycleStage | null> {
  const userRows = await sql`
    SELECT profile_type FROM users WHERE id = ${userId} LIMIT 1
  `;
  const user = userRows[0] as { profile_type: 'driver' | 'rider' | 'admin' } | undefined;
  if (!user) return null;

  if (user.profile_type === 'driver') {
    const rows = await sql`
      SELECT
        dp.display_name, dp.handle, dp.area_slugs, dp.services_entire_market,
        dp.pricing, dp.thumbnail_url, dp.video_url, dp.vehicle_info,
        dp.stripe_onboarding_complete, u.last_sign_in_at,
        (dp.user_id IS NOT NULL) as has_profile_row,
        EXISTS (SELECT 1 FROM hmu_posts hp WHERE hp.user_id = u.id) as has_posts
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    const d = rows[0] as DriverStateRow | undefined;
    if (!d) return null;
    return classifyDriverStage({
      has_profile_row: d.has_profile_row,
      display_name: d.display_name,
      handle: d.handle,
      area_slugs: d.area_slugs,
      services_entire_market: d.services_entire_market,
      pricing: d.pricing,
      thumbnail_url: d.thumbnail_url,
      video_url: d.video_url,
      vehicle_info: d.vehicle_info,
      stripe_onboarding_complete: d.stripe_onboarding_complete,
      last_sign_in_at: d.last_sign_in_at,
      has_posts: d.has_posts,
    });
  }

  if (user.profile_type === 'rider') {
    const rows = await sql`
      SELECT
        rp.display_name, rp.thumbnail_url, rp.avatar_url, u.last_sign_in_at,
        (SELECT COUNT(*) FROM rides r WHERE r.rider_id = u.id AND r.status = 'completed') as rides_completed_count,
        (SELECT COUNT(*) FROM hmu_posts hp WHERE hp.user_id = u.id AND hp.post_type = 'rider_request') as ride_requests_count,
        EXISTS (SELECT 1 FROM rider_payment_methods rpm WHERE rpm.rider_id = u.id) as has_payment_method,
        (rp.user_id IS NOT NULL) as has_profile_row
      FROM users u
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    const r = rows[0] as RiderStateRow | undefined;
    if (!r) return null;
    return classifyRiderStage({
      has_profile_row: r.has_profile_row,
      display_name: r.display_name,
      thumbnail_url: r.thumbnail_url,
      avatar_url: r.avatar_url,
      has_payment_method: r.has_payment_method,
      rides_completed_count: Number(r.rides_completed_count ?? 0),
      ride_requests_count: Number(r.ride_requests_count ?? 0),
      last_sign_in_at: r.last_sign_in_at,
    });
  }

  return null;
}
