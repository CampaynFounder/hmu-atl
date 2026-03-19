// Profile Database Operations
// CRUD operations for rider_profiles and driver_profiles tables

import { sql } from './client';
import type { RiderProfile, DriverProfile } from './types';

// ============================================
// RIDER PROFILES
// ============================================

export interface CreateRiderProfileParams {
  user_id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  gender?: string;
  pronouns?: string;
  lgbtq_friendly?: boolean;
  video_url?: string;
  thumbnail_url?: string;
  driver_gender_pref?: string;
  require_lgbtq_friendly?: boolean;
  min_driver_rating?: number;
  require_verification?: boolean;
  avoid_disputes?: boolean;
  price_range?: string;
  stripe_customer_id?: string;
}

export interface UpdateRiderProfileParams {
  first_name?: string;
  last_name?: string;
  gender?: string;
  pronouns?: string;
  lgbtq_friendly?: boolean;
  video_url?: string;
  thumbnail_url?: string;
  driver_gender_pref?: string;
  require_lgbtq_friendly?: boolean;
  min_driver_rating?: number;
  require_verification?: boolean;
  avoid_disputes?: boolean;
  price_range?: string;
  stripe_customer_id?: string;
}

export async function createRiderProfile(
  params: CreateRiderProfileParams
): Promise<RiderProfile> {
  const safetyPrefs = JSON.stringify({
    driver_gender_pref: params.driver_gender_pref || 'no_preference',
    require_lgbtq_friendly: params.require_lgbtq_friendly || false,
    min_driver_rating: params.min_driver_rating || 4.0,
    require_verification: params.require_verification || false,
    avoid_disputes: params.avoid_disputes ?? true,
  });

  const result = await sql`
    INSERT INTO rider_profiles (
      user_id,
      first_name,
      last_name,
      display_name,
      lgbtq_friendly,
      video_url,
      thumbnail_url,
      safety_preferences,
      driver_preference,
      price_range,
      stripe_customer_id
    ) VALUES (
      ${params.user_id},
      ${params.first_name},
      ${params.last_name},
      ${params.display_name || `${params.first_name} ${params.last_name?.charAt(0) || ''}.`.trim()},
      ${params.lgbtq_friendly || false},
      ${params.video_url || null},
      ${params.thumbnail_url || null},
      ${safetyPrefs},
      ${params.driver_gender_pref || 'no_preference'},
      ${JSON.stringify({ range: params.price_range || 'medium' })},
      ${params.stripe_customer_id || null}
    )
    RETURNING *
  `;

  return result[0] as RiderProfile;
}

export async function getRiderProfileByUserId(
  userId: string
): Promise<RiderProfile | null> {
  const result = await sql`
    SELECT * FROM rider_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  return result[0] as RiderProfile || null;
}

export async function updateRiderProfile(
  userId: string,
  params: UpdateRiderProfileParams
): Promise<RiderProfile> {
  const existing = await getRiderProfileByUserId(userId);
  if (!existing) {
    throw new Error('Rider profile not found');
  }

  // Build safety preferences JSON
  const safetyPrefs = existing.safety_preferences || {};
  if (params.driver_gender_pref !== undefined) {
    safetyPrefs.driver_gender_pref = params.driver_gender_pref;
  }
  if (params.require_lgbtq_friendly !== undefined) {
    safetyPrefs.require_lgbtq_friendly = params.require_lgbtq_friendly;
  }
  if (params.min_driver_rating !== undefined) {
    safetyPrefs.min_driver_rating = params.min_driver_rating;
  }
  if (params.require_verification !== undefined) {
    safetyPrefs.require_verification = params.require_verification;
  }
  if (params.avoid_disputes !== undefined) {
    safetyPrefs.avoid_disputes = params.avoid_disputes;
  }

  const result = await sql`
    UPDATE rider_profiles
    SET
      first_name = COALESCE(${params.first_name}, first_name),
      last_name = COALESCE(${params.last_name}, last_name),
      gender = COALESCE(${params.gender || null}, gender),
      pronouns = COALESCE(${params.pronouns || null}, pronouns),
      lgbtq_friendly = COALESCE(${params.lgbtq_friendly}, lgbtq_friendly),
      video_url = COALESCE(${params.video_url || null}, video_url),
      thumbnail_url = COALESCE(${params.thumbnail_url || null}, thumbnail_url),
      safety_preferences = ${JSON.stringify(safetyPrefs)},
      price_range = COALESCE(${params.price_range}, price_range),
      stripe_customer_id = COALESCE(${params.stripe_customer_id || null}, stripe_customer_id),
      updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING *
  `;

  return result[0] as RiderProfile;
}

// ============================================
// DRIVER PROFILES
// ============================================

export interface CreateDriverProfileParams {
  user_id: string;
  first_name: string;
  last_name: string;
  gender?: string;
  pronouns?: string;
  lgbtq_friendly?: boolean;
  video_url?: string;
  thumbnail_url?: string;
  areas?: string[];
  pricing?: {
    base_rate?: number;
    per_mile?: number;
    per_minute?: number;
    minimum?: number;
  };
  schedule?: {
    monday?: { available: boolean; hours?: string[] };
    tuesday?: { available: boolean; hours?: string[] };
    wednesday?: { available: boolean; hours?: string[] };
    thursday?: { available: boolean; hours?: string[] };
    friday?: { available: boolean; hours?: string[] };
    saturday?: { available: boolean; hours?: string[] };
    sunday?: { available: boolean; hours?: string[] };
  };
  vehicle_info?: {
    make?: string;
    model?: string;
    year?: number;
    color?: string;
    license_plate?: string;
    capacity?: number;
  };
  stripe_connect_id?: string;
  handle?: string;
  display_name?: string;
  accept_direct_bookings?: boolean;
  min_rider_chill_score?: number;
  require_og_status?: boolean;
}

export interface UpdateDriverProfileParams {
  first_name?: string;
  last_name?: string;
  gender?: string;
  pronouns?: string;
  lgbtq_friendly?: boolean;
  video_url?: string;
  thumbnail_url?: string;
  areas?: string[];
  pricing?: Record<string, any>;
  schedule?: Record<string, any>;
  vehicle_info?: Record<string, any>;
  stripe_connect_id?: string;
  handle?: string;
  accept_direct_bookings?: boolean;
  min_rider_chill_score?: number;
  require_og_status?: boolean;
}

// ─── Handle generation ───────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function generateDriverHandle(
  displayName: string,
  _lastName?: string
): Promise<string> {
  // Generate handle from display name (public identity), not legal name
  const base = slugify(displayName);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const existing = await sql`
      SELECT id FROM driver_profiles WHERE handle = ${candidate} LIMIT 1
    `;
    if (existing.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
}

export async function getDriverProfileByHandle(
  handle: string
): Promise<DriverProfile | null> {
  const result = await sql`
    SELECT * FROM driver_profiles WHERE handle = ${handle} LIMIT 1
  `;
  return (result[0] as DriverProfile) || null;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createDriverProfile(
  params: CreateDriverProfileParams
): Promise<DriverProfile> {
  const displayName = params.display_name
    || (params.first_name
      ? `${params.first_name} ${params.last_name ? params.last_name.charAt(0) + '.' : ''}`.trim()
      : 'Driver');

  const handle = params.handle || (await generateDriverHandle(displayName));

  const result = await sql`
    INSERT INTO driver_profiles (
      user_id,
      first_name,
      last_name,
      display_name,
      lgbtq_friendly,
      video_url,
      thumbnail_url,
      areas,
      pricing,
      schedule,
      vehicle_info,
      stripe_account_id,
      handle,
      accept_direct_bookings,
      min_rider_chill_score,
      require_og_status
    ) VALUES (
      ${params.user_id},
      ${params.first_name},
      ${params.last_name},
      ${displayName},
      ${params.lgbtq_friendly || false},
      ${params.video_url || null},
      ${params.thumbnail_url || null},
      ${JSON.stringify(params.areas || [])},
      ${JSON.stringify(params.pricing || {})},
      ${JSON.stringify(params.schedule || {})},
      ${JSON.stringify(params.vehicle_info || {})},
      ${params.stripe_connect_id || null},
      ${handle},
      ${params.accept_direct_bookings ?? true},
      ${params.min_rider_chill_score ?? 0},
      ${params.require_og_status ?? false}
    )
    RETURNING *
  `;

  return result[0] as DriverProfile;
}

export async function getDriverProfileByUserId(
  userId: string
): Promise<DriverProfile | null> {
  const result = await sql`
    SELECT * FROM driver_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  return result[0] as DriverProfile || null;
}

export async function updateDriverProfile(
  userId: string,
  params: UpdateDriverProfileParams
): Promise<DriverProfile> {
  const existing = await getDriverProfileByUserId(userId);
  if (!existing) {
    throw new Error('Driver profile not found');
  }

  const result = await sql`
    UPDATE driver_profiles
    SET
      first_name = COALESCE(${params.first_name ?? null}, first_name),
      last_name = COALESCE(${params.last_name ?? null}, last_name),
      display_name = COALESCE(${params.first_name ? `${params.first_name} ${(params.last_name ?? '').charAt(0)}.`.trim() : null}, display_name),
      lgbtq_friendly = COALESCE(${params.lgbtq_friendly ?? null}, lgbtq_friendly),
      video_url = COALESCE(${params.video_url ?? null}, video_url),
      thumbnail_url = COALESCE(${params.thumbnail_url ?? null}, thumbnail_url),
      areas = COALESCE(${params.areas ? JSON.stringify(params.areas) : null}::jsonb, areas),
      pricing = COALESCE(${params.pricing ? JSON.stringify(params.pricing) : null}::jsonb, pricing),
      schedule = COALESCE(${params.schedule ? JSON.stringify(params.schedule) : null}::jsonb, schedule),
      vehicle_info = COALESCE(${params.vehicle_info ? JSON.stringify(params.vehicle_info) : null}::jsonb, vehicle_info),
      handle = COALESCE(${params.handle ?? null}, handle),
      accept_direct_bookings = COALESCE(${params.accept_direct_bookings ?? null}, accept_direct_bookings),
      min_rider_chill_score = COALESCE(${params.min_rider_chill_score ?? null}, min_rider_chill_score),
      require_og_status = COALESCE(${params.require_og_status ?? null}, require_og_status),
      updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING *
  `;

  return result[0] as DriverProfile;
}

// ============================================
// AVAILABILITY
// ============================================

export async function updateDriverAvailability(
  userId: string,
  schedule: Record<string, any>
): Promise<DriverProfile> {
  return updateDriverProfile(userId, { schedule });
}
