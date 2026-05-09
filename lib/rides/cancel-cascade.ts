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
// Ordering: rides.status flip → publish status_change to ride:{id} + direct
// notifyUser to the other party → run housekeeping (booking, posts, safety)
// in parallel → fan out to interested drivers → await everything. The
// overlay on the OTHER party's /ride/[id] page must appear before cleanup
// completes; pushing Ably last (the original order) was adding 500ms-1s of
// dead air between cancel-tap and the other side's overlay.
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

  // 1. Flip rides.status FIRST so any /api/rides/[id] GET on the receiving
  // side reads the cancelled truth. This is the only step that must precede
  // the realtime publish — the active-ride client subscribes to ride:{id}
  // and just sets local state from the payload, but other surfaces may
  // refetch.
  if (!skipStatusUpdate) {
    try {
      await sql`UPDATE rides SET status = 'cancelled', updated_at = NOW() WHERE id = ${rideId}`;
    } catch (e) {
      console.error('[cancel-cascade] rides update failed:', e);
    }
  }

  // 2. Realtime fan-out goes NEXT, not last. The other party's /ride/[id]
  // page renders the "Ride was cancelled" overlay off ride.status, and it
  // gets that status from this status_change event. Pushing this after all
  // the housekeeping below was adding 500ms-1s before the overlay appeared.
  const payload = {
    rideId,
    status: 'cancelled',
    message: reason,
    cancelledBy: initiator,
    ...extra,
  };

  // Direct recipients we know up front (the matched driver / rider). The
  // interested-drivers fan-out happens after ride_interests cleanup below
  // since we need their ids back from that UPDATE.
  const directRecipients = new Set<string>();
  if (initiator === 'rider' || initiator === 'mutual') {
    if (ride.driver_id) directRecipients.add(ride.driver_id);
  }
  if (initiator === 'driver' || initiator === 'mutual') {
    if (ride.rider_id) directRecipients.add(ride.rider_id);
  }
  // Always notify the rider — covers mutual + edge where driver_id is null.
  if (ride.rider_id) directRecipients.add(ride.rider_id);

  const earlyAblyJobs: Promise<unknown>[] = [
    publishRideUpdate(rideId, 'status_change', payload).catch((e) =>
      console.error('[cancel-cascade] publishRideUpdate failed:', e),
    ),
  ];
  for (const userId of directRecipients) {
    earlyAblyJobs.push(
      notifyUser(userId, 'ride_update', payload).catch((e) =>
        console.error(`[cancel-cascade] notifyUser ${userId} failed:`, e),
      ),
    );
  }

  // 3. Housekeeping in parallel. None of these gate the user-visible overlay.
  const cleanupJobs: Promise<unknown>[] = [];

  // Release the calendar booking. Payment hold is the caller's concern
  // because some paths do partial capture before cancelling.
  cleanupJobs.push(
    cancelRideBooking(rideId).catch((e) =>
      console.error('[cancel-cascade] cancelRideBooking failed:', e),
    ),
  );

  // Reactivate post + expire other drivers' interests (only meaningful for
  // broadcast rides that went through hmu_posts → ride_interests).
  let interestExpireJob: Promise<Array<{ driver_id: string }>> = Promise.resolve(
    [] as Array<{ driver_id: string }>,
  );
  if (ride.hmu_post_id) {
    cleanupJobs.push(
      (sql`
        UPDATE hmu_posts SET status = 'active', expires_at = NOW() + INTERVAL '2 hours'
        WHERE id = ${ride.hmu_post_id}
      ` as Promise<unknown>).catch((e) =>
        console.error('[cancel-cascade] hmu_posts reactivate failed:', e),
      ),
    );

    // Only flip active interests — 'passed' rows stay so drivers who said
    // no don't see the same post again. 'selected' becomes 'expired' so the
    // matched driver can't act on a dead row.
    interestExpireJob = (sql`
      UPDATE ride_interests
      SET status = 'expired', updated_at = NOW()
      WHERE post_id = ${ride.hmu_post_id}
        AND status IN ('interested', 'selected')
      RETURNING driver_id
    ` as Promise<Array<{ driver_id: string }>>).catch((e) => {
      console.error('[cancel-cascade] ride_interests expire failed:', e);
      return [] as Array<{ driver_id: string }>;
    });
  }

  // Resolve any open safety check-in prompts so they don't sit in the
  // admin pending queue or count toward ignored-streak detection. Pending
  // is `response IS NULL`; we settle them as 'ride_cancelled'.
  cleanupJobs.push(
    (sql`
      UPDATE ride_safety_checks
      SET response = 'ride_cancelled',
          responded_at = NOW()
      WHERE ride_id = ${rideId} AND response IS NULL
    ` as Promise<unknown>).catch((e) =>
      console.error('[cancel-cascade] ride_safety_checks resolve failed:', e),
    ),
  );

  // Auto-resolve any open safety events (off-route, GPS silence, etc.)
  // so the admin live-map concern indicator clears. Resolved_by left NULL
  // since this is system-driven, not an admin action.
  cleanupJobs.push(
    (sql`
      UPDATE ride_safety_events
      SET admin_resolved_at = NOW(),
          admin_notes = COALESCE(admin_notes, '') ||
            CASE WHEN admin_notes IS NULL OR admin_notes = ''
                 THEN 'Auto-resolved: ride cancelled'
                 ELSE E'\n[Auto-resolved: ride cancelled]' END
      WHERE ride_id = ${rideId} AND admin_resolved_at IS NULL
    ` as Promise<unknown>).catch((e) =>
      console.error('[cancel-cascade] ride_safety_events resolve failed:', e),
    ),
  );

  // 4. Wait for ride_interests so we know which drivers to refetch.
  const interestRows = await interestExpireJob;
  const interestedDriverIds = interestRows.map((r) => r.driver_id);

  // 5. Fan out to every driver whose interest we just expired. Their
  // /driver/home feed refetches and picks up the reactivated post.
  const fanoutJobs: Promise<unknown>[] = interestedDriverIds
    .filter((id) => !directRecipients.has(id))
    .map((id) =>
      notifyUser(id, 'ride_update', payload).catch((e) =>
        console.error(`[cancel-cascade] notifyUser ${id} failed:`, e),
      ),
    );

  // 6. Await everything before returning so callers (Stripe refund, route
  // response) see a settled cascade.
  await Promise.all([...earlyAblyJobs, ...cleanupJobs, ...fanoutJobs]);

  return { interestedDriverIds };
}
