// Shared cascade logic for ride cancellations. Every cancel path in
// /api/rides/[id]/cancel must run this so the blast radius is consistent:
//
//   rides.status      → 'cancelled'
//   driver_bookings   → 'cancelled' (calendar block released)
//   hmu_posts         → reactivated + 2h expiry (rebroadcast for other drivers)
//   ride_interests    → 'expired' for every driver who had active interest
//   Stripe hold       → released (or partial-captured upstream before call)
//
// Realtime fan-out:
//   ride:{id}             → 'status_change' (riders/drivers on /ride/[id])
//   user:{driver}:notify  → 'ride_update' for the matched driver
//   user:{other}:notify   → 'ride_update' for every driver whose ride_interests
//                           row we just expired — their /driver/home refetches
//
// ride_safety_checks pending rows are auto-resolved as 'ride_cancelled' so
// the admin pending-queue and ignored-streak detector treat them as
// settled-by-cancel, not silently abandoned.
//
// ride_safety_events with admin_resolved_at IS NULL are auto-resolved with
// admin_notes='Auto-resolved: ride cancelled' so the admin live-map
// concern indicator clears for the dead ride.
//
// user_notifications are left alone (they're history).

import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { cancelRideBooking } from '@/lib/schedule/conflicts';

export interface CancellableRide {
  id: string;
  driver_id: string | null;
  rider_id: string | null;
  hmu_post_id: string | null;
}

export interface CancelCascadeOptions {
  ride: CancellableRide;
  /** Human-readable reason — lands in the ride_update payload. */
  reason: string;
  /**
   * Who should see the outgoing `ride_update` marked as initiator.
   * 'rider' → driver is primary recipient
   * 'driver' → rider is primary recipient
   * 'mutual' → both
   */
  initiator: 'rider' | 'driver' | 'mutual';
  /**
   * Additional payload fields merged into the ride_update/status_change
   * messages (e.g. cancelSplit on driver-agrees-to-cancel path).
   */
  extra?: Record<string, unknown>;
  /**
   * When true, skip the rides.status UPDATE. Used when the caller already
   * flipped status (e.g. rider-requests-cancel keeps status for driver approval).
   */
  skipStatusUpdate?: boolean;
}

/**
 * Run the full cascade. Safe to call from any cancel path. Swallows
 * individual side-effect failures (logs them) so a Stripe glitch can't
 * leave ride_interests stale, and vice versa.
 */
export async function cascadeRideCancel(opts: CancelCascadeOptions): Promise<{
  interestedDriverIds: string[];
}> {
  const { ride, reason, initiator, extra = {}, skipStatusUpdate } = opts;
  const rideId = ride.id;

  // 1. Flip rides.status unless caller already did it.
  if (!skipStatusUpdate) {
    try {
      await sql`UPDATE rides SET status = 'cancelled', updated_at = NOW() WHERE id = ${rideId}`;
    } catch (e) {
      console.error('[cancel-cascade] rides update failed:', e);
    }
  }

  // 2. Release the calendar booking. Payment hold is the caller's concern
  // because some paths do partial capture before cancelling.
  await cancelRideBooking(rideId).catch((e) =>
    console.error('[cancel-cascade] cancelRideBooking failed:', e),
  );

  // 3. Reactivate post + expire other drivers' interests (only meaningful for
  // broadcast rides that went through hmu_posts → ride_interests).
  let interestedDriverIds: string[] = [];
  if (ride.hmu_post_id) {
    try {
      await sql`
        UPDATE hmu_posts SET status = 'active', expires_at = NOW() + INTERVAL '2 hours'
        WHERE id = ${ride.hmu_post_id}
      `;
    } catch (e) {
      console.error('[cancel-cascade] hmu_posts reactivate failed:', e);
    }

    try {
      // Only flip active interests — 'passed' rows stay so drivers who said
      // no don't see the same post again. 'selected' becomes 'expired' so the
      // matched driver can't act on a dead row.
      const rows = (await sql`
        UPDATE ride_interests
        SET status = 'expired', updated_at = NOW()
        WHERE post_id = ${ride.hmu_post_id}
          AND status IN ('interested', 'selected')
        RETURNING driver_id
      `) as Array<{ driver_id: string }>;
      interestedDriverIds = rows.map((r) => r.driver_id);
    } catch (e) {
      console.error('[cancel-cascade] ride_interests expire failed:', e);
    }
  }

  // 4. Resolve any open safety check-in prompts so they don't sit in the
  // admin pending queue or count toward ignored-streak detection. Pending
  // is `response IS NULL`; we settle them as 'ride_cancelled'.
  try {
    await sql`
      UPDATE ride_safety_checks
      SET response = 'ride_cancelled',
          responded_at = NOW()
      WHERE ride_id = ${rideId} AND response IS NULL
    `;
  } catch (e) {
    console.error('[cancel-cascade] ride_safety_checks resolve failed:', e);
  }

  // 5. Auto-resolve any open safety events (off-route, GPS silence, etc.)
  // so the admin live-map concern indicator clears. Resolved_by left NULL
  // since this is system-driven, not an admin action.
  try {
    await sql`
      UPDATE ride_safety_events
      SET admin_resolved_at = NOW(),
          admin_notes = COALESCE(admin_notes, '') ||
            CASE WHEN admin_notes IS NULL OR admin_notes = ''
                 THEN 'Auto-resolved: ride cancelled'
                 ELSE E'\n[Auto-resolved: ride cancelled]' END
      WHERE ride_id = ${rideId} AND admin_resolved_at IS NULL
    `;
  } catch (e) {
    console.error('[cancel-cascade] ride_safety_events resolve failed:', e);
  }

  // 6. Realtime fan-out. Publishes are fire-and-forget — a single Ably
  // failure shouldn't make the HTTP response hang or fail.
  const payload = { rideId, status: 'cancelled', message: reason, ...extra };

  const ablyJobs: Promise<unknown>[] = [
    publishRideUpdate(rideId, 'status_change', payload).catch((e) =>
      console.error('[cancel-cascade] publishRideUpdate failed:', e),
    ),
  ];

  // Build recipient set. Use a Set to dedupe (matched driver might also be
  // in interestedDriverIds from the ride_interests cleanup above).
  const recipients = new Set<string>();
  if (initiator === 'rider' || initiator === 'mutual') {
    if (ride.driver_id) recipients.add(ride.driver_id);
  }
  if (initiator === 'driver' || initiator === 'mutual') {
    if (ride.rider_id) recipients.add(ride.rider_id);
  }
  // Every driver whose interest we just expired needs to know so their
  // /driver/home feed refetches and picks up the reactivated post.
  for (const id of interestedDriverIds) recipients.add(id);
  // Also notify the rider unconditionally — covers the mutual case + the
  // edge where driver_id is null (shouldn't happen at 'matched' but defensive).
  if (ride.rider_id) recipients.add(ride.rider_id);

  for (const userId of recipients) {
    ablyJobs.push(
      notifyUser(userId, 'ride_update', payload).catch((e) =>
        console.error(`[cancel-cascade] notifyUser ${userId} failed:`, e),
      ),
    );
  }

  await Promise.all(ablyJobs);

  return { interestedDriverIds };
}
