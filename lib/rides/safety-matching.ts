// Enhanced matching algorithm with safety & comfort filters
// Prioritizes: Safety > Proximity > Rating > Price

import { pool } from '@/lib/db/client';
import { calculateDistance, getBoundingBox } from '@/lib/geo/distance';

export type GenderPreference =
  | 'no_preference'
  | 'women_only'
  | 'men_only'
  | 'prefer_women'
  | 'prefer_men';

export type MatchingPriority =
  | 'safety_first'
  | 'proximity_first'
  | 'price_first'
  | 'rating_first';

export interface SafetyPreferences {
  genderPref: GenderPreference;
  requireLgbtqFriendly: boolean;
  minRating: number;
  requireVerification: boolean;
  avoidDisputes: boolean;
  maxTripDistanceMiles?: number;
  matchingPriority: MatchingPriority;
}

export interface UserSafetyProfile {
  id: string;
  gender: string | null;
  lgbtqFriendly: boolean;
  isVerified: boolean;
  backgroundCheckStatus: string;
  avgRating: number;
  activeReports: number;
  timesBlocked: number;
  activeDisputes: number;
}

export interface SafeMatchResult {
  userId: string;
  distanceToPickup: number;
  estimatedETA: number;
  safetyScore: number; // 0-100
  matchScore: number; // Total score for ranking
  matchReasons: string[]; // Why this is a good match
  gender: string | null;
  lgbtqFriendly: boolean;
  rating: number;
  isVerified: boolean;
}

/**
 * Check if user matches safety requirements (hard filters)
 */
export function meetsSafetyRequirements(
  user: UserSafetyProfile,
  preferences: SafetyPreferences
): { passes: boolean; reason?: string } {
  // Gender preference (strict)
  if (preferences.genderPref === 'women_only' && user.gender !== 'woman') {
    return { passes: false, reason: 'Gender preference not met' };
  }
  if (preferences.genderPref === 'men_only' && user.gender !== 'man') {
    return { passes: false, reason: 'Gender preference not met' };
  }

  // LGBTQ+ friendly requirement
  if (preferences.requireLgbtqFriendly && !user.lgbtqFriendly) {
    return { passes: false, reason: 'LGBTQ+ friendly requirement not met' };
  }

  // Minimum rating
  if (user.avgRating < preferences.minRating) {
    return { passes: false, reason: `Rating below minimum (${preferences.minRating})` };
  }

  // Verification requirement
  if (preferences.requireVerification && !user.isVerified) {
    return { passes: false, reason: 'Verification required' };
  }

  // Avoid users with active disputes
  if (preferences.avoidDisputes && user.activeDisputes > 0) {
    return { passes: false, reason: 'Active disputes' };
  }

  // Avoid users with safety reports
  if (user.activeReports > 2) {
    return { passes: false, reason: 'Multiple safety reports' };
  }

  return { passes: true };
}

/**
 * Calculate match score based on preferences
 */
export function calculateMatchScore(
  user: UserSafetyProfile,
  preferences: SafetyPreferences,
  distanceMiles: number
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Gender preference bonus (soft preferences)
  if (preferences.genderPref === 'prefer_women' && user.gender === 'woman') {
    score += 100;
    reasons.push('Preferred gender match');
  }
  if (preferences.genderPref === 'prefer_men' && user.gender === 'man') {
    score += 100;
    reasons.push('Preferred gender match');
  }
  if (preferences.genderPref === 'no_preference') {
    score += 50; // Neutral bonus
  }

  // LGBTQ+ friendly bonus
  if (user.lgbtqFriendly && preferences.requireLgbtqFriendly) {
    score += 50;
    reasons.push('LGBTQ+ friendly');
  }

  // Rating bonus
  if (user.avgRating >= 4.9) {
    score += 50;
    reasons.push('Excellent rating (4.9+)');
  } else if (user.avgRating >= 4.7) {
    score += 30;
    reasons.push('Great rating (4.7+)');
  } else if (user.avgRating >= 4.5) {
    score += 20;
  }

  // Verification bonus
  if (user.isVerified) {
    score += 30;
    reasons.push('Verified profile');
  }
  if (user.backgroundCheckStatus === 'approved') {
    score += 20;
    reasons.push('Background check approved');
  }

  // Safety score (no reports/disputes/blocks)
  if (user.activeReports === 0 && user.activeDisputes === 0 && user.timesBlocked === 0) {
    score += 40;
    reasons.push('Clean safety record');
  }

  // Proximity bonus (inverse distance)
  if (distanceMiles <= 1) {
    score += 50;
    reasons.push('Very close (< 1 mile)');
  } else if (distanceMiles <= 3) {
    score += 30;
    reasons.push('Nearby (< 3 miles)');
  } else if (distanceMiles <= 5) {
    score += 10;
  }

  return { score, reasons };
}

/**
 * Find nearby drivers/riders with safety filters
 */
export async function findSafeMatches(params: {
  userId: string; // The user requesting match
  userType: 'rider' | 'driver'; // Who is searching
  pickupLocation: { latitude: number; longitude: number };
  radiusMiles?: number;
  preferences: SafetyPreferences;
}): Promise<SafeMatchResult[]> {
  const radiusMiles = params.radiusMiles || 10;
  const bounds = getBoundingBox(params.pickupLocation, radiusMiles);

  // Get blocked users to exclude
  const blockedResult = await pool.query(
    `SELECT blocked_id FROM blocked_users WHERE blocker_id = $1`,
    [params.userId]
  );
  const blockedIds = blockedResult.rows.map((r: any) => r.blocked_id);

  // Also exclude users who blocked this user
  const blockersResult = await pool.query(
    `SELECT blocker_id FROM blocked_users WHERE blocked_id = $1`,
    [params.userId]
  );
  const blockerIds = blockersResult.rows.map((r: any) => r.blocker_id);
  const excludedIds = [...blockedIds, ...blockerIds];

  // Find potential matches based on user type
  let query: string;
  let queryParams: any[];

  if (params.userType === 'rider') {
    // Rider looking for drivers
    query = `
      SELECT
        u.id,
        u.gender,
        u.lgbtq_friendly,
        u.is_verified,
        u.background_check_status,
        dp.current_latitude as latitude,
        dp.current_longitude as longitude,
        uss.avg_rating,
        uss.active_reports,
        uss.times_blocked,
        uss.active_disputes,
        uss.verification_score,
        uss.safety_score,
        up.rider_gender_pref,
        up.min_rider_rating
      FROM users u
      JOIN driver_profiles dp ON dp.user_id = u.id
      JOIN user_safety_scores uss ON uss.user_id = u.id
      LEFT JOIN user_preferences up ON up.user_id = u.id
      WHERE u.account_status = 'active'
        AND dp.current_latitude BETWEEN $1 AND $2
        AND dp.current_longitude BETWEEN $3 AND $4
        ${excludedIds.length > 0 ? `AND u.id NOT IN (${excludedIds.map((_, i) => `$${i + 5}`).join(',')})` : ''}
      LIMIT 50
    `;
    queryParams = [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng, ...excludedIds];
  } else {
    // Driver looking for riders
    query = `
      SELECT
        u.id,
        u.gender,
        u.lgbtq_friendly,
        u.is_verified,
        u.background_check_status,
        uss.avg_rating,
        uss.active_reports,
        uss.times_blocked,
        uss.active_disputes,
        uss.verification_score,
        uss.safety_score
      FROM users u
      JOIN user_safety_scores uss ON uss.user_id = u.id
      WHERE u.account_status = 'active'
        AND u.profile_type IN ('rider', 'both')
        ${excludedIds.length > 0 ? `AND u.id NOT IN (${excludedIds.map((_, i) => `$${i + 1}`).join(',')})` : ''}
      LIMIT 50
    `;
    queryParams = excludedIds;
  }

  const result = await pool.query(query, queryParams);

  // Filter and score matches
  const matches: SafeMatchResult[] = [];

  for (const row of result.rows) {
    const userProfile: UserSafetyProfile = {
      id: row.id,
      gender: row.gender,
      lgbtqFriendly: row.lgbtq_friendly || false,
      isVerified: row.is_verified || false,
      backgroundCheckStatus: row.background_check_status || 'pending',
      avgRating: parseFloat(row.avg_rating) || 5.0,
      activeReports: parseInt(row.active_reports) || 0,
      timesBlocked: parseInt(row.times_blocked) || 0,
      activeDisputes: parseInt(row.active_disputes) || 0,
    };

    // Apply safety filters
    const safetyCheck = meetsSafetyRequirements(userProfile, params.preferences);
    if (!safetyCheck.passes) {
      continue; // Skip users who don't meet safety requirements
    }

    // For drivers, check if rider meets THEIR preferences too (mutual match)
    if (params.userType === 'rider' && row.rider_gender_pref) {
      // Get rider's gender to check against driver's preference
      const riderGender = await getUserGender(params.userId);
      const driverPref = row.rider_gender_pref as GenderPreference;

      if (driverPref === 'women_only' && riderGender !== 'woman') continue;
      if (driverPref === 'men_only' && riderGender !== 'man') continue;

      // Check minimum rider rating
      const riderRating = await getUserRating(params.userId);
      if (riderRating < (row.min_rider_rating || 4.0)) continue;
    }

    // Calculate distance
    const distanceToPickup = params.userType === 'rider' && row.latitude
      ? calculateDistance(params.pickupLocation, {
          latitude: row.latitude,
          longitude: row.longitude,
        })
      : 0;

    // Skip if too far
    if (distanceToPickup > radiusMiles) continue;

    // Calculate match score
    const { score, reasons } = calculateMatchScore(
      userProfile,
      params.preferences,
      distanceToPickup
    );

    // Apply matching priority multiplier
    let finalScore = score;
    switch (params.preferences.matchingPriority) {
      case 'safety_first':
        finalScore += (row.safety_score || 0) * 2; // Double weight on safety
        break;
      case 'proximity_first':
        finalScore += distanceToPickup > 0 ? (100 / distanceToPickup) * 2 : 100;
        break;
      case 'rating_first':
        finalScore += userProfile.avgRating * 40; // Max 200 bonus
        break;
      case 'price_first':
        // Price matching would be added here based on offer/pricing
        break;
    }

    matches.push({
      userId: row.id,
      distanceToPickup,
      estimatedETA: Math.round(distanceToPickup * 3), // Rough estimate: 3 min per mile
      safetyScore: row.safety_score || 0,
      matchScore: finalScore,
      matchReasons: reasons,
      gender: row.gender,
      lgbtqFriendly: row.lgbtq_friendly || false,
      rating: userProfile.avgRating,
      isVerified: userProfile.isVerified,
    });
  }

  // Sort by match score (highest first)
  matches.sort((a, b) => b.matchScore - a.matchScore);

  return matches;
}

/**
 * Helper: Get user's gender
 */
async function getUserGender(userId: string): Promise<string | null> {
  const result = await pool.query('SELECT gender FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.gender || null;
}

/**
 * Helper: Get user's rating (converted from categorical to numeric)
 */
async function getUserRating(userId: string): Promise<number> {
  const result = await pool.query(
    'SELECT avg_rating FROM user_safety_scores WHERE user_id = $1',
    [userId]
  );
  return parseFloat(result.rows[0]?.avg_rating) || 5.0;
}
