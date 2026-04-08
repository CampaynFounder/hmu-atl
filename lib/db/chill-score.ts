import { sql } from './client';

export interface ChillScoreConfig {
  coolAfMultiplier: number;
  chillMultiplier: number;
  creepyMultiplier: number;
  weirdoMultiplier: number;
  baseWeight: number;
  minWeight: number;
  coolAfMin: number;
  chillMin: number;
  aightMin: number;
  sketchyMin: number;
  inactivityDays: number;
  decayPerWeek: number;
  decayFloor: number;
  weirdoAutoReviewCount: number;
  retaliationWindowMinutes: number;
}

export interface VibeTier {
  tier: 'cool_af' | 'chill' | 'aight' | 'sketchy' | 'weirdo';
  label: string;
  emoji: string;
  color: string;
}

const DEFAULTS: ChillScoreConfig = {
  coolAfMultiplier: 0.5,
  chillMultiplier: 0.2,
  creepyMultiplier: 1.5,
  weirdoMultiplier: 3.0,
  baseWeight: 20,
  minWeight: 2,
  coolAfMin: 90,
  chillMin: 75,
  aightMin: 50,
  sketchyMin: 25,
  inactivityDays: 30,
  decayPerWeek: 1,
  decayFloor: 75,
  weirdoAutoReviewCount: 3,
  retaliationWindowMinutes: 5,
};

/** Fetch live config from DB, with defaults fallback */
export async function getChillConfig(): Promise<ChillScoreConfig> {
  try {
    const rows = await sql`SELECT config_value FROM platform_config WHERE config_key = 'chill_score' LIMIT 1`;
    if (rows.length) {
      return { ...DEFAULTS, ...(rows[0] as { config_value: Record<string, unknown> }).config_value } as ChillScoreConfig;
    }
  } catch { /* fallback to defaults */ }
  return DEFAULTS;
}

/** Map a numeric score to a vibe tier using configurable thresholds */
export function getVibeTier(score: number, config?: ChillScoreConfig): VibeTier {
  const c = config || DEFAULTS;
  if (score >= c.coolAfMin) return { tier: 'cool_af', label: 'Cool AF', emoji: '\uD83D\uDE0E', color: '#00E676' };
  if (score >= c.chillMin) return { tier: 'chill', label: 'CHILL', emoji: '\u2705', color: '#00E676' };
  if (score >= c.aightMin) return { tier: 'aight', label: 'Aight', emoji: '\uD83E\uDD37', color: '#FFD600' };
  if (score >= c.sketchyMin) return { tier: 'sketchy', label: 'Sketchy', emoji: '\uD83D\uDC40', color: '#FF9100' };
  return { tier: 'weirdo', label: 'WEIRDO', emoji: '\uD83D\uDEA9', color: '#FF5252' };
}

/**
 * Recalculate a user's chill score after a new rating.
 * Called from the rating submission API.
 *
 * Returns the new score and whether auto-review was triggered.
 */
export async function recalculateChillScore(
  ratedUserId: string,
  newRatingType: 'chill' | 'cool_af' | 'kinda_creepy' | 'weirdo',
  raterId: string,
  rideId: string
): Promise<{ newScore: number; tier: VibeTier; autoReview: boolean; retaliation: boolean }> {
  const config = await getChillConfig();

  // Get current state
  const userRows = await sql`
    SELECT chill_score, completed_rides FROM users WHERE id = ${ratedUserId} LIMIT 1
  `;
  if (!userRows.length) throw new Error('User not found');

  const user = userRows[0] as { chill_score: number; completed_rides: number };
  const currentScore = Number(user.chill_score ?? 100);
  const totalRides = Math.max(1, Number(user.completed_rides ?? 1));

  // Calculate weight — diminishes as ride count grows
  const weight = Math.max(config.minWeight, config.baseWeight / Math.sqrt(totalRides));

  // Apply multiplier based on rating type
  let delta: number;
  switch (newRatingType) {
    case 'cool_af':
      delta = weight * config.coolAfMultiplier;
      break;
    case 'chill':
      delta = weight * config.chillMultiplier;
      break;
    case 'kinda_creepy':
      delta = -(weight * config.creepyMultiplier);
      break;
    case 'weirdo':
      delta = -(weight * config.weirdoMultiplier);
      break;
  }

  // Clamp to 0–100
  const newScore = Math.round(Math.min(100, Math.max(0, currentScore + delta)) * 100) / 100;

  // Update user
  await sql`UPDATE users SET chill_score = ${newScore}, updated_at = NOW() WHERE id = ${ratedUserId}`;

  // Check for auto-review: N unique WEIRDO raters
  let autoReview = false;
  if (newRatingType === 'weirdo') {
    const weirdoCount = await sql`
      SELECT COUNT(DISTINCT rater_id)::int as count FROM ratings
      WHERE rated_id = ${ratedUserId} AND rating_type = 'weirdo'
    `;
    const uniqueWeirdos = Number((weirdoCount[0] as { count: number }).count);
    if (uniqueWeirdos >= config.weirdoAutoReviewCount) {
      autoReview = true;
      // Flag for admin review
      await sql`
        UPDATE users SET account_status = 'suspended', updated_at = NOW()
        WHERE id = ${ratedUserId} AND account_status = 'active'
      `;
    }
  }

  // Check for retaliation: mutual WEIRDO within window
  let retaliation = false;
  if (newRatingType === 'weirdo' || newRatingType === 'kinda_creepy') {
    const mutualRows = await sql`
      SELECT id FROM ratings
      WHERE rater_id = ${ratedUserId}
        AND rated_id = ${raterId}
        AND ride_id = ${rideId}
        AND rating_type IN ('weirdo', 'kinda_creepy')
        AND created_at > NOW() - INTERVAL '${config.retaliationWindowMinutes} minutes'
      LIMIT 1
    `;
    if (mutualRows.length) {
      retaliation = true;
      // Flag both ratings for review — don't count either
      await sql`
        UPDATE ratings SET flagged_for_review = true
        WHERE ride_id = ${rideId} AND (rater_id = ${raterId} OR rater_id = ${ratedUserId})
      `;
      // Reverse the score change since this rating is flagged
      await sql`UPDATE users SET chill_score = ${currentScore}, updated_at = NOW() WHERE id = ${ratedUserId}`;
    }
  }

  const tier = getVibeTier(retaliation ? currentScore : newScore, config);
  return { newScore: retaliation ? currentScore : newScore, tier, autoReview, retaliation };
}

/**
 * Apply inactivity decay to a user's chill score.
 * Call this periodically (e.g., daily cron or on login).
 */
export async function applyInactivityDecay(userId: string): Promise<number | null> {
  const config = await getChillConfig();

  const rows = await sql`
    SELECT u.chill_score,
      (SELECT MAX(created_at) FROM rides WHERE driver_id = u.id OR rider_id = u.id) as last_ride_at
    FROM users u WHERE u.id = ${userId} LIMIT 1
  `;
  if (!rows.length) return null;

  const user = rows[0] as { chill_score: number; last_ride_at: string | null };
  const score = Number(user.chill_score ?? 100);

  if (!user.last_ride_at) return score; // No rides yet, no decay
  if (score <= config.decayFloor) return score; // Already at floor

  const daysSinceLastRide = (Date.now() - new Date(user.last_ride_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceLastRide < config.inactivityDays) return score; // Not inactive yet

  const weeksInactive = Math.floor((daysSinceLastRide - config.inactivityDays) / 7);
  if (weeksInactive <= 0) return score;

  const decayAmount = weeksInactive * config.decayPerWeek;
  const newScore = Math.max(config.decayFloor, score - decayAmount);

  if (newScore !== score) {
    await sql`UPDATE users SET chill_score = ${newScore}, updated_at = NOW() WHERE id = ${userId}`;
  }

  return newScore;
}
