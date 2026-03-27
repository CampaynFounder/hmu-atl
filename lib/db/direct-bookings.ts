import { sql } from './client';
import type { HmuPost } from './types';

export type EligibilityCode =
  | 'ok'
  | 'no_payment_method'
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

const HOURLY_BOOKING_LIMIT = 5;
const DAILY_BOOKING_LIMIT = 15;
const BOOKING_EXPIRY_MINUTES = 15;

export async function checkRiderEligibility(
  riderId: string,
  driverUserId: string,
  isCash: boolean = false
): Promise<EligibilityResult> {
  // Fetch rider + driver + payment + daily count in parallel
  const [riderRows, driverRows, dailyCountRows, hourlyCountRows, paymentRows] = await Promise.all([
    sql`
      SELECT chill_score, og_status
      FROM users
      WHERE id = ${riderId}
      LIMIT 1
    `,
    sql`
      SELECT accept_direct_bookings, min_rider_chill_score, require_og_status, handle
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
    sql`
      SELECT COUNT(*) AS count
      FROM hmu_posts
      WHERE user_id = ${riderId}
        AND post_type = 'direct_booking'
        AND created_at > NOW() - INTERVAL '1 hour'
    `,
    sql`
      SELECT id FROM rider_payment_methods
      WHERE rider_id = ${riderId}
      LIMIT 1
    `,
  ]);

  const rider = riderRows[0] as {
    chill_score: number;
    og_status: boolean;
  } | undefined;

  const driver = driverRows[0] as {
    accept_direct_bookings: boolean;
    min_rider_chill_score: number;
    require_og_status: boolean;
    handle: string | null;
  } | undefined;

  const dailyCount = Number((dailyCountRows[0] as { count: string }).count);
  const hourlyCount = Number((hourlyCountRows[0] as { count: string }).count);
  const hasPaymentMethod = paymentRows.length > 0;

  const riderChillScore = rider?.chill_score ?? 0;
  const riderOgStatus = rider?.og_status ?? false;

  // 1. Payment method check — skip for cash rides
  if (!isCash && !hasPaymentMethod) {
    const driverHandle = driver?.handle || 'This driver';
    return {
      eligible: false,
      code: 'no_payment_method',
      reason: `${driverHandle} only accepts payment ready riders`,
      riderChillScore,
      riderOgStatus,
      dailyBookingsUsed: dailyCount,
    };
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

  // 5. Rate limit checks — hourly + daily
  if (hourlyCount >= HOURLY_BOOKING_LIMIT) {
    return {
      eligible: false,
      code: 'daily_limit_hit',
      reason: `You've sent ${HOURLY_BOOKING_LIMIT} requests this hour. Try again in a bit.`,
      riderChillScore,
      riderOgStatus,
      dailyBookingsUsed: dailyCount,
    };
  }
  if (dailyCount >= DAILY_BOOKING_LIMIT) {
    return {
      eligible: false,
      code: 'daily_limit_hit',
      reason: `You've sent ${DAILY_BOOKING_LIMIT} requests today. Try again tomorrow.`,
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
      NOW() + INTERVAL '15 minutes',
      NOW() + INTERVAL '15 minutes'
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
