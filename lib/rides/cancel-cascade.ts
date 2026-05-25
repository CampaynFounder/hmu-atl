// Shared cascade logic for ride cancellations. Every cancel path must run
// this so the blast radius is consistent:
//
//   rides.status      → 'cancelled' (+ cancel_resolution stamped by caller)
//   driver_bookings   → 'cancelled' (calendar block released)
//   hmu_posts         → 'cancelled' (the post dies with the ride; rider
//                       can opt-in to re-broadcast via the explicit
//                       /broadcast-after-decline endpoint if they want
//                       to keep looking — never the default)
//   ride_interests    → 'expired' for every driver who had ACTIVE interest
//                       ('passed' rows are left alone — drivers who already
//                       said no must NOT see the rebroadcast and must NOT
//                       receive a notification when a different driver later
//                       accepts)
//   ride_add_ons      → 'cancelled' for any pending/confirmed extras
//   safety check-ins  → 'ride_cancelled' for any pending prompts
//   safety events     → admin_resolved_at stamped, admin_notes appended
//   Stripe hold       → released (or partial-captured upstream before call)
//
// Realtime fan-out:
//   ride:{id}             → 'status_change' with full payload (active-ride
//                           client renders overlay off this)
//   user:{driver}:notify  → 'ride_update' for the matched driver if rider
//                           initiated (or both on mutual)
//   user:{rider}:notify   → 'ride_update' for the rider if driver initiated
//                           (or both on mutual). Always notified so the
//                           rider's home/feed refetches even if they navigated
//                           away from /ride/[id].
//   user:{other}:notify   → 'ride_update' for every driver whose
//                           ride_interests row we just expired — their
//                           /driver/home refetches and the dead post drops
//                           out of their feed.
//
// Ordering: rides.status flip → publish status_change to ride:{id} + direct
// notifyUser to the other party → run housekeeping (booking, posts, safety,
// add-ons) in parallel → fan out to interested drivers → await everything.
// The overlay on the OTHER party's /ride/[id] page must appear before
// cleanup completes; pushing Ably last (the original order) was adding
// 500ms-1s of dead air between cancel-tap and the other side's overlay.
//
// Idempotency: callers may invoke cascadeRideCancel more than once
// (double-tap, retry-on-failure, cron backstop). We early-return after the
// first successful run so the second tap doesn't fan out a duplicate
// notification storm. The check reads rides.status fresh each call.
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

export type CancelResolution =
  | 'rider_pre_otw'
  | 'driver_pre_otw'
  | 'mutual_agreed'
  | 'driver_declined_kept_deposit'
  | 'timeout_no_response'
  | 'admin_cancelled';

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
   * Final resolution of the cancellation — written to rides.cancel_resolution
   * so admin tooling and the ledger can distinguish the path the cancel
   * took. Optional for callers that haven't migrated yet; once they have,
   * this should always be set.
   */
  resolution?: CancelResolution;
  /**
   * Additional payload fields merged into the ride_update/status_change
   * messages (e.g. cancelSplit on driver-agrees-to-cancel path).
   */
  extra?: Record<string, unknown>;
  /**
   * When true, skip the rides.status UPDATE. The caller is responsible for
   * having flipped status already (e.g. money handler that needs to see
   * funds_held=false before a downstream Stripe call).
   */
  skipStatusUpdate?: boolean;
}

export interface CascadeResult {
  interestedDriverIds: string[];
  /** True if cascade was a no-op because the ride was already cancelled. */
  alreadyCancelled: boolean;
}

/**
 * Run the full cascade. Safe to call from any cancel path; idempotent on
 * repeat invocations. Swallows individual side-effect failures (logs them)
 * so a Stripe glitch can't leave ride_interests stale, and vice versa.
 */
export async function cascadeRideCancel(opts: CancelCascadeOptions): Promise<CascadeResult> {
  const { ride, reason, initiator, resolution, extra = {}, skipStatusUpdate } = opts;
  const rideId = ride.id;

  // 0. Idempotency. Read current status; if already cancelled, this is a
  // double-fire (timeout cron + client both racing, double-tap, etc.).
  // Return without re-publishing or re-cleaning. The second caller still
  // gets back the interested-drivers list so any UI logic depending on it
  // remains correct, sourced from the now-frozen ride_interests rows.
  const existing = (await sql`
    SELECT status, cancel_resolution FROM rides WHERE id = ${rideId} LIMIT 1
  `) as Array<{ status: string; cancel_resolution: string | null }>;
  if (existing[0]?.status === 'cancelled') {
    const passedRows = (await sql`
      SELECT driver_id FROM ride_interests
      WHERE post_id = ${ride.hmu_post_id ?? '00000000-0000-0000-0000-000000000000'}
        AND status = 'expired'
    `) as Array<{ driver_id: string }>;
    return {
      interestedDriverIds: passedRows.map((r) => r.driver_id),
      alreadyCancelled: true,
    };
  }

  // 1. Flip rides.status FIRST so any /api/rides/[id] GET on the receiving
  // side reads the cancelled truth even if it lands before the realtime
  // event arrives. cancel_resolution is stamped in the same UPDATE so
  // admin tooling and ledger reconciliation see them atomic.
  if (!skipStatusUpdate) {
    try {
      await sql`
        UPDATE rides
        SET status = 'cancelled',
            cancel_resolution = COALESCE(${resolution ?? null}, cancel_resolution),
            updated_at = NOW()
        WHERE id = ${rideId}
      `;
    } catch (e) {
      console.error('[cancel-cascade] rides update failed:', e);
    }
  } else if (resolution) {
    // Caller already flipped status — still record the resolution.
    try {
      await sql`
        UPDATE rides SET cancel_resolution = ${resolution}, updated_at = NOW()
        WHERE id = ${rideId} AND cancel_resolution IS NULL
      `;
    } catch (e) {
      console.error('[cancel-cascade] resolution update failed:', e);
    }
  }

  // 2. Realtime fan-out goes NEXT, not last. The other party's /ride/[id]
  // page renders the "Ride was cancelled" overlay off ride.status, and it
  // gets that status from this status_change event.
  const payload = {
    rideId,
    status: 'cancelled',
    message: reason,
    cancelledBy: initiator,
    resolution: resolution ?? null,
    ...extra,
  };

  // Direct recipients we know up front (the matched driver / rider).
  // We always notify BOTH sides via user:{id}:notify regardless of who
  // initiated, so whichever side has navigated off /ride/[id] still gets
  // its home/feed refetched. The active-ride overlay is driven by the
  // ride:{id} status_change publish below — that's the source of truth
  // for the canceller-vs-other UX branching done client-side.
  const directRecipients = new Set<string>();
  if (ride.driver_id) directRecipients.add(ride.driver_id);
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

  // Cancel the linked post + expire other drivers' interests. Founder rule:
  // a cancelled ride means the request is dead. The rider can choose to
  // re-broadcast via the explicit /broadcast-after-decline endpoint if
  // they want to keep looking — never automatic. Auto-reactivating posts
  // was leaving stale "looking for drivers" countdowns on /rider/home and
  // creating UX loops where the rider thought their request was still live.
  let interestExpireJob: Promise<Array<{ driver_id: string }>> = Promise.resolve(
    [] as Array<{ driver_id: string }>,
  );
  if (ride.hmu_post_id) {
    cleanupJobs.push(
      (sql`
        UPDATE hmu_posts SET status = 'cancelled'
        WHERE id = ${ride.hmu_post_id}
      ` as Promise<unknown>).catch((e) =>
        console.error('[cancel-cascade] hmu_posts cancel failed:', e),
      ),
    );

    // Only flip ACTIVE interests — 'passed' rows stay so drivers who said
    // no don't see the same post again AND don't receive a re-broadcast
    // notification when a different driver later accepts. 'selected'
    // becomes 'expired' so the matched driver can't act on a dead row.
    // This contract is load-bearing for the founder's "originally
    // requested driver should NOT be notified" rule — pinned by test
    // tests/cancel-cascade.test.ts.
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

  // Cancel any pending/confirmed add-ons so they don't sit billable on a
  // dead ride. 'removed' rows are already terminal; we only flip the
  // active states.
  cleanupJobs.push(
    (sql`
      UPDATE ride_add_ons
      SET status = 'removed', updated_at = NOW()
      WHERE ride_id = ${rideId}
        AND status IN ('pre_selected', 'pending_driver', 'confirmed', 'removal_pending')
    ` as Promise<unknown>).catch((e) =>
      console.error('[cancel-cascade] ride_add_ons cleanup failed:', e),
    ),
  );

  // Resolve any open safety check-in prompts so they don't sit in the
  // admin pending queue or count toward ignored-streak detection.
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

  // Auto-resolve any open safety events so the admin live-map concern
  // indicator clears. Resolved_by left NULL since this is system-driven.
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

  // 5. Fan out to every driver whose ACTIVE interest we just expired.
  // 'passed' drivers are intentionally excluded (see comment above on the
  // ride_interests UPDATE). Direct recipients also excluded since they
  // already got notified above.
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

  return { interestedDriverIds, alreadyCancelled: false };
}
