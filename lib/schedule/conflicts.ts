import { sql } from '@/lib/db/client';
import { parseNaturalTime } from '@/lib/schedule/parse-time';

/**
 * Booking lifecycle. New statuses beyond tentative/confirmed/cancelled:
 *  - scheduled:   confirmed booking whose ride hasn't started yet (future)
 *  - in_progress: ride is otw/here/confirming/active
 *  - completed:   ride completed
 *  - no_show:     driver pulled off with a no-show charge
 */
export type BookingStatus =
  | 'tentative'
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'no_show'
  | 'cancelled';

/** Statuses that still occupy a driver's calendar slot (block new bookings). */
const ACTIVE_BOOKING_STATUSES = ['tentative', 'scheduled', 'confirmed', 'in_progress'] as const;

/**
 * Statuses that block under LOOSE checking (cash rides). Only an actively
 * running ride blocks — drivers can stack future cash bookings at their own
 * discretion since no money is held. For non-cash (Stripe hold) we use
 * ACTIVE_BOOKING_STATUSES so a held card can never collide.
 */
const STRICT_IN_PROGRESS_STATUSES = ['in_progress'] as const;

const DEFAULT_RIDE_MINUTES = 45;

export interface ConflictResult {
  available: boolean;
  conflict: { id: string; bookingType: string; startAt: string; endAt: string; title: string | null } | null;
  isWorkingHours: boolean;
}

export interface BookingWindow {
  startAt: string;
  endAt: string;
  isNow: boolean;
}

/**
 * Single source of truth for turning a post's time_window (or any natural time)
 * into a concrete [startAt, endAt] window. All booking routes must use this —
 * previously three sites hardcoded `new Date(iso).getTime() + 45 * 60000`.
 */
export function resolveBookingWindow(
  timeWindow: Record<string, unknown> | string | null | undefined,
  estimatedMinutes: number = DEFAULT_RIDE_MINUTES
): BookingWindow {
  let raw = '';
  if (typeof timeWindow === 'string') {
    raw = timeWindow;
  } else if (timeWindow && typeof timeWindow === 'object') {
    raw = (timeWindow.resolvedTime as string) || (timeWindow.time as string) || '';
  }
  const parsed = parseNaturalTime(raw);
  const startMs = new Date(parsed.iso).getTime();
  const endAt = new Date(startMs + estimatedMinutes * 60000).toISOString();
  return { startAt: parsed.iso, endAt, isNow: parsed.isNow };
}

/**
 * Check if a driver is available for a proposed time slot.
 * Returns availability status, any conflicting booking, and whether
 * the driver is scheduled to work at that time.
 */
export async function checkDriverAvailability(
  driverId: string,
  proposedStart: string,
  proposedEnd: string,
  opts: { strict?: boolean } = {}
): Promise<ConflictResult> {
  // Default to strict — held funds (Stripe) must never double-book.
  // Pass strict=false only for cash rides where a chargeback isn't possible.
  const strict = opts.strict !== false;
  const blockingStatuses = strict ? ACTIVE_BOOKING_STATUSES : STRICT_IN_PROGRESS_STATUSES;

  // 0. Expire stale tentative holds first
  await expireStaleTentativeHolds(driverId);

  // 1. Check for booking conflicts.
  // Strict (default, non-cash): any tentative/scheduled/confirmed/in_progress blocks.
  // Loose (cash only): only an actively running ride (in_progress) blocks.
  const conflicts = await sql`
    SELECT id, booking_type, start_at, end_at, title, status
    FROM driver_bookings
    WHERE driver_id = ${driverId}
      AND status = ANY(${blockingStatuses as unknown as string[]})
      AND start_at < ${proposedEnd}
      AND end_at > ${proposedStart}
    ORDER BY start_at
    LIMIT 1
  `;

  if (conflicts.length) {
    const c = conflicts[0] as Record<string, unknown>;
    return {
      available: false,
      conflict: {
        id: c.id as string,
        bookingType: c.booking_type as string,
        startAt: c.start_at as string,
        endAt: c.end_at as string,
        title: c.title as string | null,
      },
      isWorkingHours: true,
    };
  }

  // 2. Check if driver is scheduled to work at this time
  const proposedDate = new Date(proposedStart);
  const dayOfWeek = proposedDate.getDay();
  const timeStr = proposedDate.toTimeString().slice(0, 5); // "HH:MM"

  const scheduleRows = await sql`
    SELECT start_time, end_time, is_active
    FROM driver_schedules
    WHERE driver_id = ${driverId} AND day_of_week = ${dayOfWeek}
    LIMIT 1
  `;

  if (!scheduleRows.length) {
    // No schedule set for this day — treat as available (schedule not configured yet)
    return { available: true, conflict: null, isWorkingHours: false };
  }

  const sched = scheduleRows[0] as { start_time: string; end_time: string; is_active: boolean };
  if (!sched.is_active) {
    return { available: false, conflict: null, isWorkingHours: false };
  }

  // Check if proposed time falls within working hours
  const startTime = sched.start_time.slice(0, 5);
  const endTime = sched.end_time.slice(0, 5);
  const isWithinHours = timeStr >= startTime && timeStr < endTime;

  return {
    available: isWithinHours,
    conflict: null,
    isWorkingHours: isWithinHours,
  };
}

/**
 * Create a booking entry when a ride is matched.
 * Status is `confirmed` for imminent rides and `scheduled` for future rides
 * (more than 15 minutes out) so callers can distinguish the two without
 * re-parsing the time.
 */
export async function createRideBooking(
  driverId: string,
  riderId: string,
  rideId: string,
  startAt: string,
  marketId: string | null,
  estimatedMinutes: number = DEFAULT_RIDE_MINUTES
): Promise<string> {
  const endAt = new Date(new Date(startAt).getTime() + estimatedMinutes * 60000).toISOString();
  const status: BookingStatus =
    new Date(startAt).getTime() - Date.now() > 15 * 60000 ? 'scheduled' : 'confirmed';

  const rows = await sql`
    INSERT INTO driver_bookings (driver_id, rider_id, ride_id, booking_type, start_at, end_at, status, market_id)
    VALUES (${driverId}, ${riderId}, ${rideId}, 'ride', ${startAt}, ${endAt}, ${status}, ${marketId})
    RETURNING id
  `;

  await sql`
    INSERT INTO schedule_events (driver_id, rider_id, event_type, market_id, details)
    VALUES (${driverId}, ${riderId}, 'booking_created', ${marketId}, ${JSON.stringify({ rideId, startAt, endAt, status })}::jsonb)
  `;

  return (rows[0] as { id: string }).id;
}

/**
 * Create a tentative calendar hold when a booking request is submitted.
 * This blocks the time slot during the 15-min acceptance window so no
 * other rider can book the same time. Expires automatically if not confirmed.
 */
export async function createTentativeBooking(
  driverId: string,
  riderId: string,
  postId: string,
  startAt: string,
  marketId: string | null,
  estimatedMinutes: number = DEFAULT_RIDE_MINUTES,
  holdMinutes: number = 15
): Promise<string> {
  const endAt = new Date(new Date(startAt).getTime() + estimatedMinutes * 60000).toISOString();
  const expiresAt = new Date(Date.now() + holdMinutes * 60000).toISOString();

  const rows = await sql`
    INSERT INTO driver_bookings (driver_id, rider_id, booking_type, start_at, end_at, status, market_id, title, details)
    VALUES (${driverId}, ${riderId}, 'hold', ${startAt}, ${endAt}, 'tentative', ${marketId}, 'Pending booking request',
      ${JSON.stringify({ postId, expiresAt })}::jsonb)
    RETURNING id
  `;

  return (rows[0] as { id: string }).id;
}

/**
 * Promote a tentative hold to a confirmed ride booking.
 * Called when the driver accepts the booking request.
 */
export async function confirmTentativeBooking(
  driverId: string,
  riderId: string,
  rideId: string,
  postId: string,
  startAt: string,
  marketId: string | null,
  estimatedMinutes: number = DEFAULT_RIDE_MINUTES
): Promise<string> {
  const status: BookingStatus =
    new Date(startAt).getTime() - Date.now() > 15 * 60000 ? 'scheduled' : 'confirmed';

  // Try to update existing tentative hold first
  const updated = await sql`
    UPDATE driver_bookings
    SET status = ${status}, booking_type = 'ride', ride_id = ${rideId},
        title = NULL, updated_at = NOW()
    WHERE driver_id = ${driverId} AND status = 'tentative'
      AND details IS NOT NULL AND details->>'postId' = ${postId}
    RETURNING id
  `;

  if (updated.length) {
    await sql`
      INSERT INTO schedule_events (driver_id, rider_id, event_type, market_id, details)
      VALUES (${driverId}, ${riderId}, 'booking_confirmed', ${marketId}, ${JSON.stringify({ rideId, postId, startAt })}::jsonb)
    `;
    return (updated[0] as { id: string }).id;
  }

  // No tentative hold found — create fresh confirmed booking
  return createRideBooking(driverId, riderId, rideId, startAt, marketId, estimatedMinutes);
}

/**
 * Expire stale tentative holds that are past their acceptance window.
 * Called reactively before availability checks.
 */
export async function expireStaleTentativeHolds(driverId: string): Promise<void> {
  await sql`
    UPDATE driver_bookings SET status = 'cancelled', updated_at = NOW()
    WHERE driver_id = ${driverId}
      AND status = 'tentative'
      AND (
        (details IS NOT NULL AND details->>'expiresAt' IS NOT NULL AND (details->>'expiresAt')::timestamptz < NOW())
        OR created_at < NOW() - INTERVAL '20 minutes'
      )
  `;
}

/**
 * Cancel a booking when a ride is cancelled. Pass noShow=true when the
 * cancellation is a driver pulloff with a no-show charge so the row lands
 * in 'no_show' instead of plain 'cancelled' (kept for analytics/history).
 */
export async function cancelRideBooking(
  rideId: string,
  opts: { noShow?: boolean } = {}
): Promise<void> {
  const target: BookingStatus = opts.noShow ? 'no_show' : 'cancelled';
  await sql`
    UPDATE driver_bookings SET status = ${target}, updated_at = NOW()
    WHERE ride_id = ${rideId}
      AND status = ANY(${ACTIVE_BOOKING_STATUSES as unknown as string[]})
  `;
}

/**
 * Cancel a tentative hold when a booking request expires or is cancelled.
 */
export async function cancelTentativeBooking(postId: string): Promise<void> {
  await sql`
    UPDATE driver_bookings SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'tentative' AND details IS NOT NULL AND details->>'postId' = ${postId}
  `;
}

/**
 * When a rider picks one driver from the interested pool, cancel every
 * OTHER driver's tentative hold for the same post so those slots free up
 * immediately instead of waiting on expireStaleTentativeHolds to sweep them.
 */
export async function cancelOtherTentativeHoldsForPost(
  postId: string,
  keepDriverId: string
): Promise<void> {
  await sql`
    UPDATE driver_bookings SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'tentative'
      AND driver_id != ${keepDriverId}
      AND details IS NOT NULL AND details->>'postId' = ${postId}
  `;
}

/**
 * Map a ride status to the corresponding booking status, then update any
 * booking row linked to that ride. Called from ride lifecycle routes
 * (otw/here/start/confirm-start/end/rate/cancel/pulloff) so the calendar is
 * always a projection of the authoritative ride state.
 *
 * Returns silently on unknown statuses — the booking simply stays where it is.
 */
export async function syncBookingFromRide(
  rideId: string,
  rideStatus: string,
  opts: { noShow?: boolean } = {}
): Promise<void> {
  let target: BookingStatus | null = null;
  switch (rideStatus) {
    case 'matched':
      // Already handled by createRideBooking/confirmTentativeBooking at match time.
      return;
    case 'otw':
    case 'here':
    case 'confirming':
    case 'active':
      target = 'in_progress';
      break;
    case 'ended':
      // Ride is over but dispute window open; keep slot occupied.
      target = 'in_progress';
      break;
    case 'completed':
      target = 'completed';
      break;
    case 'cancelled':
    case 'refunded':
      target = opts.noShow ? 'no_show' : 'cancelled';
      break;
    case 'disputed':
      // Under review — don't mutate booking row.
      return;
    default:
      return;
  }

  await sql`
    UPDATE driver_bookings
    SET status = ${target}, updated_at = NOW()
    WHERE ride_id = ${rideId}
      AND status = ANY(${ACTIVE_BOOKING_STATUSES as unknown as string[]})
  `;
}

/**
 * Find available drivers for a proposed time.
 * Returns drivers who are working and not booked.
 */
export async function findAvailableDrivers(
  marketId: string,
  proposedStart: string,
  proposedEnd: string,
  excludeDriverId?: string
): Promise<string[]> {
  const dayOfWeek = new Date(proposedStart).getDay();
  const timeStr = new Date(proposedStart).toTimeString().slice(0, 5);

  // Drivers who are scheduled to work at this time and not booked
  const rows = await sql`
    SELECT DISTINCT ds.driver_id
    FROM driver_schedules ds
    JOIN users u ON u.id = ds.driver_id
    WHERE ds.day_of_week = ${dayOfWeek}
      AND ds.is_active = true
      AND ds.start_time <= ${timeStr}::time
      AND ds.end_time > ${timeStr}::time
      AND u.market_id = ${marketId}
      AND u.account_status = 'active'
      AND u.profile_type = 'driver'
      ${excludeDriverId ? sql`AND ds.driver_id != ${excludeDriverId}` : sql``}
      AND ds.driver_id NOT IN (
        SELECT driver_id FROM driver_bookings
        WHERE status = ANY(${ACTIVE_BOOKING_STATUSES as unknown as string[]})
          AND start_at < ${proposedEnd}
          AND end_at > ${proposedStart}
      )
    LIMIT 10
  `;

  return rows.map((r: Record<string, unknown>) => r.driver_id as string);
}
