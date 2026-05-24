import { sql } from './client';
import type { HmuPost } from './types';

export type EligibilityCode =
  | 'ok'
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

const HOURLY_BOOKING_LIMIT_DEFAULT = 5;
const DAILY_BOOKING_LIMIT_DEFAULT = 15;

export async function checkRiderEligibility(
  riderId: string,
  driverUserId: string,
  isCash: boolean = false,
  limits: { hourly?: number; daily?: number } = {}
): Promise<EligibilityResult> {
  const hourlyLimit = limits.hourly ?? HOURLY_BOOKING_LIMIT_DEFAULT;
  const dailyLimit = limits.daily ?? DAILY_BOOKING_LIMIT_DEFAULT;
  // Fetch rider + driver + payment + daily count in parallel
  const [riderRows, driverRows, dailyCountRows, hourlyCountRows, paymentRows] = await Promise.all([
    sql`
      SELECT chill_score, og_status
      FROM users
      WHERE id = ${riderId}
      LIMIT 1
    `,
    sql`
      SELECT accept_direct_bookings, min_rider_chill_score, require_og_status, handle, cash_only
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
    cash_only: boolean | null;
  } | undefined;

  const dailyCount = Number((dailyCountRows[0] as { count: string }).count);
  const hourlyCount = Number((hourlyCountRows[0] as { count: string }).count);
  const hasPaymentMethod = paymentRows.length > 0;

  const riderChillScore = rider?.chill_score ?? 100;
  const riderOgStatus = rider?.og_status ?? false;

  // Payment-method gate moved to /api/rides/[id]/coo (Pull Up). Riders no
  // longer need a saved card to BOOK — they need one to commit. This makes
  // the funnel single-path for anon and authed riders: pick driver → submit →
  // driver accepts → rider taps Pull Up, and only then is a card required.
  // hasPaymentMethod is intentionally unused here; COO is the single gate.
  void hasPaymentMethod;

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
  if (hourlyCount >= hourlyLimit) {
    return {
      eligible: false,
      code: 'daily_limit_hit',
      reason: `You've sent ${hourlyLimit} requests this hour. Try again in a bit.`,
      riderChillScore,
      riderOgStatus,
      dailyBookingsUsed: dailyCount,
    };
  }
  if (dailyCount >= dailyLimit) {
    return {
      eligible: false,
      code: 'daily_limit_hit',
      reason: `You've sent ${dailyLimit} requests today. Try again tomorrow.`,
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
  marketId: string;
  price: number;
  areas: string[];
  pickupAreaSlug: string | null;
  dropoffAreaSlug: string | null;
  dropoffInMarket: boolean;
  timeWindow: Record<string, unknown>;
  isCash?: boolean;
  expiryMinutes?: number;
}): Promise<HmuPost> {
  const expiry = params.expiryMinutes ?? 15;
  const result = await sql`
    INSERT INTO hmu_posts (
      user_id,
      post_type,
      market_id,
      pickup_area_slug,
      dropoff_area_slug,
      dropoff_in_market,
      areas,
      price,
      time_window,
      status,
      target_driver_id,
      booking_expires_at,
      expires_at,
      is_cash
    ) VALUES (
      ${params.riderId},
      'direct_booking',
      ${params.marketId},
      ${params.pickupAreaSlug},
      ${params.dropoffAreaSlug},
      ${params.dropoffInMarket},
      ${params.areas},
      ${params.price},
      ${JSON.stringify(params.timeWindow)},
      'active',
      ${params.driverUserId},
      NOW() + make_interval(mins := ${expiry}),
      NOW() + make_interval(mins := ${expiry}),
      ${params.isCash || false}
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

export interface RiderConflict {
  type: 'blast' | 'direct_booking';
  postId: string;
  code: 'ACTIVE_BLAST_EXISTS' | 'TIME_WINDOW_CONFLICT';
  expiresAt: string | null;
}

/**
 * Check if a rider has an active blast or a direct booking whose time window
 * overlaps [startAt, endAt]. Returns the first conflict found or null.
 *
 * Called by POST /api/drivers/[handle]/book before inserting a new request.
 * Overlap formula: existing.start < proposed.end AND existing.end > proposed.start.
 * ASAP bookings (isNow=true or missing resolvedTime) use NOW() + 4 h so an
 * in-flight ASAP request blocks any immediate or near-future window.
 */
export async function checkRiderRequestConflict(
  riderId: string,
  startAt: string,
  endAt: string
): Promise<RiderConflict | null> {
  const [blastRows, directRows] = await Promise.all([
    sql`
      SELECT id, expires_at FROM hmu_posts
      WHERE user_id = ${riderId}
        AND post_type = 'blast'
        AND status IN ('active', 'matched')
        AND expires_at > NOW()
      LIMIT 1
    `,
    sql`
      SELECT id, booking_expires_at FROM hmu_posts
      WHERE user_id = ${riderId}
        AND post_type = 'direct_booking'
        AND status = 'active'
        AND booking_expires_at > NOW()
        AND CASE
          WHEN (time_window->>'isNow')::boolean = true
               OR NULLIF(time_window->>'resolvedTime', '') IS NULL
          THEN
            NOW() < ${endAt}::timestamptz
            AND (NOW() + INTERVAL '4 hours') > ${startAt}::timestamptz
          ELSE
            (time_window->>'resolvedTime')::timestamptz < ${endAt}::timestamptz
            AND (
              (time_window->>'resolvedTime')::timestamptz
              + make_interval(mins :=
                  GREATEST(1, COALESCE(
                    NULLIF((time_window->>'estimated_minutes')::numeric, 0)::int,
                    45
                  ))
                )
            ) > ${startAt}::timestamptz
          END
      LIMIT 1
    `,
  ]);

  if (blastRows.length) {
    const row = blastRows[0] as { id: string; expires_at: string };
    return { type: 'blast', postId: row.id, code: 'ACTIVE_BLAST_EXISTS', expiresAt: row.expires_at };
  }
  if (directRows.length) {
    const row = directRows[0] as { id: string; booking_expires_at: string };
    return { type: 'direct_booking', postId: row.id, code: 'TIME_WINDOW_CONFLICT', expiresAt: row.booking_expires_at };
  }
  return null;
}

/**
 * Returns the first active direct booking for a rider.
 * Used by POST /api/blast to block blast creation when a direct request is in flight.
 */
export async function getRiderActiveDirectBooking(
  riderId: string
): Promise<{ id: string; booking_expires_at: string } | null> {
  const rows = await sql`
    SELECT id, booking_expires_at FROM hmu_posts
    WHERE user_id = ${riderId}
      AND post_type = 'direct_booking'
      AND status = 'active'
      AND booking_expires_at > NOW()
    LIMIT 1
  `;
  return rows.length ? (rows[0] as { id: string; booking_expires_at: string }) : null;
}
