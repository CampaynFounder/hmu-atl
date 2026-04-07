import { sql } from '@/lib/db/client';

export interface ConflictResult {
  available: boolean;
  conflict: { id: string; bookingType: string; startAt: string; endAt: string; title: string | null } | null;
  isWorkingHours: boolean;
}

/**
 * Check if a driver is available for a proposed time slot.
 * Returns availability status, any conflicting booking, and whether
 * the driver is scheduled to work at that time.
 */
export async function checkDriverAvailability(
  driverId: string,
  proposedStart: string,
  proposedEnd: string
): Promise<ConflictResult> {
  // 0. Expire stale tentative holds first
  await expireStaleTentativeHolds(driverId);

  // 1. Check for booking conflicts (confirmed AND tentative holds)
  const conflicts = await sql`
    SELECT id, booking_type, start_at, end_at, title, status
    FROM driver_bookings
    WHERE driver_id = ${driverId}
      AND status IN ('confirmed', 'tentative')
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
 * Estimates ride duration at 45 minutes if no end time known.
 */
export async function createRideBooking(
  driverId: string,
  riderId: string,
  rideId: string,
  startAt: string,
  marketId: string | null,
  estimatedMinutes: number = 45
): Promise<string> {
  const endAt = new Date(new Date(startAt).getTime() + estimatedMinutes * 60000).toISOString();

  const rows = await sql`
    INSERT INTO driver_bookings (driver_id, rider_id, ride_id, booking_type, start_at, end_at, status, market_id)
    VALUES (${driverId}, ${riderId}, ${rideId}, 'ride', ${startAt}, ${endAt}, 'confirmed', ${marketId})
    RETURNING id
  `;

  await sql`
    INSERT INTO schedule_events (driver_id, rider_id, event_type, market_id, details)
    VALUES (${driverId}, ${riderId}, 'booking_created', ${marketId}, ${JSON.stringify({ rideId, startAt, endAt })}::jsonb)
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
  estimatedMinutes: number = 45,
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
  estimatedMinutes: number = 45
): Promise<string> {
  // Try to update existing tentative hold first
  const updated = await sql`
    UPDATE driver_bookings
    SET status = 'confirmed', booking_type = 'ride', ride_id = ${rideId},
        title = NULL, updated_at = NOW()
    WHERE driver_id = ${driverId} AND status = 'tentative'
      AND details->>'postId' = ${postId}
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
      AND (details->>'expiresAt')::timestamptz < NOW()
  `;
}

/**
 * Cancel a booking when a ride is cancelled.
 */
export async function cancelRideBooking(rideId: string): Promise<void> {
  await sql`
    UPDATE driver_bookings SET status = 'cancelled', updated_at = NOW()
    WHERE ride_id = ${rideId} AND status IN ('confirmed', 'tentative')
  `;
}

/**
 * Cancel a tentative hold when a booking request expires or is cancelled.
 */
export async function cancelTentativeBooking(postId: string): Promise<void> {
  await sql`
    UPDATE driver_bookings SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'tentative' AND details->>'postId' = ${postId}
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
        WHERE status IN ('confirmed', 'tentative')
          AND start_at < ${proposedEnd}
          AND end_at > ${proposedStart}
      )
    LIMIT 10
  `;

  return rows.map((r: Record<string, unknown>) => r.driver_id as string);
}
