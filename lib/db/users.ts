// User Database Operations
// CRUD operations for users table

import { sql } from './client';
import type { User, UserAttribution, ProfileType, AccountStatus, Tier } from './types';

// Default queries return only non-sensitive columns. Attribution fields
// (signup_source, referred_by_driver_id, referred_via_hmu_post_id, admin_last_seen_at)
// are admin-only and must be fetched via getUserAttribution().

export interface CreateUserParams {
  clerk_id: string;
  profile_type: ProfileType;
  phone?: string | null;
  video_intro_url?: string;
  signup_source?: 'hmu_chat' | 'direct' | 'homepage_lead' | null;
  referred_by_driver_id?: string | null;
  referred_via_hmu_post_id?: string | null;
}

export interface UpdateUserParams {
  account_status?: AccountStatus;
  tier?: Tier;
  og_status?: boolean;
  chill_score?: number;
}

// Create a new user (called from Clerk webhook after phone verification, or from onboarding fallback).
// Idempotent via ON CONFLICT — concurrent webhook events with the same clerk_id
// will not throw; the loser just re-reads the existing row. Returns { user, created }
// where created=false means someone else raced ahead.
export async function createUser(params: CreateUserParams): Promise<{ user: User; created: boolean }> {
  const result = await sql`
    INSERT INTO users (
      clerk_id,
      profile_type,
      account_status,
      chill_score,
      phone,
      signup_source,
      referred_by_driver_id,
      referred_via_hmu_post_id
    ) VALUES (
      ${params.clerk_id},
      ${params.profile_type},
      'pending_activation',
      100,
      ${params.phone ?? null},
      ${params.signup_source ?? null},
      ${params.referred_by_driver_id ?? null},
      ${params.referred_via_hmu_post_id ?? null}
    )
    ON CONFLICT (clerk_id) DO NOTHING
    RETURNING
      id, clerk_id, profile_type, account_status, tier, og_status,
      chill_score, completed_rides, is_admin, created_at, updated_at
  `;

  if (result.length > 0) {
    return { user: result[0] as User, created: true };
  }
  // Lost the race — another concurrent writer won. Re-fetch.
  const existing = await getUserByClerkId(params.clerk_id);
  if (!existing) {
    throw new Error(`createUser: ON CONFLICT DO NOTHING returned empty and re-fetch also empty for ${params.clerk_id}`);
  }
  return { user: existing, created: false };
}

// Resolve a driver handle to its user_id for signup attribution.
// Returns null if handle doesn't match any driver.
export async function resolveDriverHandleToUserId(handle: string): Promise<string | null> {
  const result = await sql`
    SELECT user_id FROM driver_profiles WHERE handle = ${handle} LIMIT 1
  `;
  return result[0]?.user_id || null;
}

// Get user by Clerk ID
export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  const result = await sql`
    SELECT
      id, clerk_id, profile_type, account_status, tier, og_status,
      chill_score, completed_rides, is_admin, created_at, updated_at
    FROM users
    WHERE clerk_id = ${clerkId}
    LIMIT 1
  `;

  return result[0] as User || null;
}

// Get user by internal ID
export async function getUserById(id: string): Promise<User | null> {
  const result = await sql`
    SELECT
      id, clerk_id, profile_type, account_status, tier, og_status,
      chill_score, completed_rides, is_admin, created_at, updated_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;

  return result[0] as User || null;
}

// Get admin-only attribution fields for a user.
// Callers: Clerk webhook, admin APIs. Never expose directly to clients.
export async function getUserAttribution(userId: string): Promise<UserAttribution | null> {
  const result = await sql`
    SELECT signup_source, referred_by_driver_id, referred_via_hmu_post_id, admin_last_seen_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;
  return (result[0] as UserAttribution) || null;
}

// Update user (simplified - updates all fields that are provided)
export async function updateUser(
  clerkId: string,
  params: UpdateUserParams
): Promise<User | null> {
  // If no params provided, just return current user
  if (Object.keys(params).length === 0) {
    return getUserByClerkId(clerkId);
  }

  // Build update query dynamically based on provided params
  // Note: We update all provided fields in a single query
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (params.account_status !== undefined) {
    values.push(params.account_status);
  }
  if (params.tier !== undefined) {
    values.push(params.tier);
  }
  if (params.og_status !== undefined) {
    values.push(params.og_status);
  }
  if (params.chill_score !== undefined) {
    values.push(params.chill_score);
  }

  // For simplicity, use conditional updates with CASE statements
  // This allows us to use sql template tag properly
  const result = await sql`
    UPDATE users SET
      account_status = COALESCE(${params.account_status ?? null}, account_status),
      tier = COALESCE(${params.tier ?? null}, tier),
      og_status = COALESCE(${params.og_status ?? null}, og_status),
      chill_score = COALESCE(${params.chill_score ?? null}, chill_score),
      updated_at = NOW()
    WHERE clerk_id = ${clerkId}
    RETURNING *
  `;

  return result[0] as User || null;
}

// Delete user (called from Clerk webhook on user.deleted)
export async function deleteUser(clerkId: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM users
    WHERE clerk_id = ${clerkId}
    RETURNING id
  `;

  return result.length > 0;
}

// Calculate OG status (10+ rides, 0 open disputes)
export async function calculateOGStatus(userId: string): Promise<boolean> {
  const result = await sql`
    SELECT
      (SELECT COUNT(*) FROM rides WHERE rider_id = ${userId} AND status = 'completed') as ride_count,
      (SELECT COUNT(*) FROM disputes WHERE filed_by = ${userId} AND status IN ('open', 'under_review')) as open_disputes
  `;

  const row = result[0] as any;
  return parseInt(row.ride_count) >= 10 && parseInt(row.open_disputes) === 0;
}

// Calculate Chill Score (aggregated ratings)
export async function calculateChillScore(userId: string): Promise<number> {
  const result = await sql`
    SELECT
      COUNT(*) as total_ratings,
      SUM(CASE WHEN rating_type = 'chill' THEN 1 ELSE 0 END) as chill_count,
      SUM(CASE WHEN rating_type = 'cool_af' THEN 1.5 ELSE 0 END) as cool_af_weighted
    FROM ratings
    WHERE rated_id = ${userId}
  `;

  const row = result[0] as any;

  if (parseInt(row.total_ratings) === 0) return 0;

  const score = ((parseInt(row.chill_count) + parseFloat(row.cool_af_weighted)) / parseInt(row.total_ratings)) * 100;
  return Math.round(score * 100) / 100; // Round to 2 decimals
}
