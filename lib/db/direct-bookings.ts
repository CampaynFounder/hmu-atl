import { sql } from './client';
import type { HmuPost } from './types';

export type EligibilityCode =
  | 'ok'
  | 'account_new'
  | 'chill_score_low'
  | 'og_required'
  | 'driver_closed'
  | 'daily_limit_hit';

export interface EligibilityResult {
  eligible: boolean;
  code: EligibilityCode;
  reason: string | null;
  riderChillScore: number;
  riderOgStatus: boolean;
  dailyBookingsUsed: number;
}

const DAILY_BOOKING_LIMIT = 3;
const BOOKING_EXPIRY_MINUTES = 15;

export async function checkRiderEligibility(
  riderId: string,
  driverUserId: string
): Promise<EligibilityResult> {
  // Fetch rider + driver data in parallel
  const [riderRows, driverRows, dailyCountRows] = await Promise.all([
    sql`
      SELECT created_at, chill_score, og_status
      FROM users
      WHERE id = ${riderId}
      LIMIT 1
    `,
    sql`
      SELECT accept_direct_bookings, min_rider_chill_score, require_og_status
      FROM driver_profiles
      WHERE user_id = ${driverUserId}
      LIMIT 1
    `,
    sql`
      SELECT COUNT(*) AS count
      FROM hmu_posts
      WHERE user_id = ${riderId}
        AND post_type = 'direct_booking'
        AND created_at > NOW() - INTERVAL '24 hours'
    `,
  ]);

  const rider = riderRows[0] as {
    created_at: Date;
    chill_score: number;
    og_status: boolean;
  } | undefined;

  const driver = driverRows[0] as {
    accept_direct_bookings: boolean;
    min_rider_chill_score: number;
    require_og_status: boolean;
  } | undefined;

  const dailyCount = Number((dailyCountRows[0] as { count: string }).count);

  const riderChillScore = rider?.chill_score ?? 0;
  const riderOgStatus = rider?.og_status ?? false;

  // 1. Account age check
  if (rider) {
    const ageMs = Date.now() - new Date(rider.created_at).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 24) {
      return {
        eligible: false,
        code: 'account_new',
        reason: 'New accounts must wait 24 hours before booking',
        riderChillScore,
        riderOgStatus,
        dailyBookingsUsed: dailyCount,
      };
    }
  }

  // 2. Driver availability check
  if (!driver || !driver.accept_direct_bookings) {
    return {
      eligible: false,
      code: 'driver_closed',
      reason: "This driver isn't accepting direct bookings right now",
      riderChillScore,
      riderOgStatus,
      dailyBookingsUsed: dailyCount,
    };
  }

  // 3. OG status check
  if (driver.require_og_status && !riderOgStatus) {
    return {
      eligible: false,
      code: 'og_required',
      reason: 'This driver only accepts OG riders (10+ completed rides)',
      riderChillScore,
      riderOgStatus,
      dailyBookingsUsed: dailyCount,
    };
  }

  // 4. Chill score check
  if (driver.min_rider_chill_score > 0 && riderChillScore < driver.min_rider_chill_score) {
    return {
      eligible: false,
      code: 'chill_score_low',
      reason: `Requires a Chill Score of ${driver.min_rider_chill_score}%`,
      riderChillScore,
      riderOgStatus,
      dailyBookingsUsed: dailyCount,
    };
  }

  // 5. Daily rate limit check
  if (dailyCount >= DAILY_BOOKING_LIMIT) {
    return {
      eligible: false,
      code: 'daily_limit_hit',
      reason: `You've sent ${DAILY_BOOKING_LIMIT} direct booking requests today. Try again tomorrow.`,
      riderChillScore,
      riderOgStatus,
      dailyBookingsUsed: dailyCount,
    };
  }

  return {
    eligible: true,
    code: 'ok',
    reason: null,
    riderChillScore,
    riderOgStatus,
    dailyBookingsUsed: dailyCount,
  };
}

export async function createDirectBookingPost(params: {
  riderId: string;
  driverUserId: string;
  price: number;
  areas: string[];
  timeWindow: Record<string, unknown>;
}): Promise<HmuPost> {
  const result = await sql`
    INSERT INTO hmu_posts (
      user_id,
      post_type,
      areas,
      price,
      time_window,
      status,
      target_driver_id,
      booking_expires_at,
      expires_at
    ) VALUES (
      ${params.riderId},
      'direct_booking',
      ${params.areas},
      ${params.price},
      ${JSON.stringify(params.timeWindow)},
      'active',
      ${params.driverUserId},
      NOW() + INTERVAL '${BOOKING_EXPIRY_MINUTES} minutes',
      NOW() + INTERVAL '${BOOKING_EXPIRY_MINUTES} minutes'
    )
    RETURNING *
  `;
  return result[0] as HmuPost;
}

export async function expireStaleDirectBookings(): Promise<number> {
  const result = await sql`
    UPDATE hmu_posts
    SET status = 'expired'
    WHERE post_type = 'direct_booking'
      AND status = 'active'
      AND booking_expires_at < NOW()
    RETURNING id, user_id, target_driver_id
  `;
  return result.length;
}

export async function getActiveDirectBooking(
  riderId: string,
  driverUserId: string
): Promise<HmuPost | null> {
  const result = await sql`
    SELECT * FROM hmu_posts
    WHERE user_id = ${riderId}
      AND target_driver_id = ${driverUserId}
      AND post_type = 'direct_booking'
      AND status = 'active'
      AND booking_expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (result[0] as HmuPost) || null;
}
