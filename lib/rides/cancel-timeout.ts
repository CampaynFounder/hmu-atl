// Resolution helper for the timeout path of the rider-cancel-after-OTW
// flow. Used by:
//   - POST /api/rides/[id]/cancel-request/timeout (called by both clients
//     when their countdown hits zero)
//   - GET  /api/cron/cancel-timeouts (5-min cron backstop for rides where
//     both clients went silent)
//
// Money:
//   feeAmount       = visible_deposit × cancellation.timeout_rider_fee_pct
//                     (default 0.20 — admin-configurable)
//   captureTotal    = feeAmount
//   driverReceives  = 0  (driver was unreachable; no compensation)
//   platformReceives= feeAmount
//   riderRefunded   = visible_deposit − feeAmount (Stripe auto-releases the
//                     remainder of the auth above feeAmount)
//
// Idempotent — relies on cascadeRideCancel's status-already-cancelled
// early-return + a row-level guard via the conditional UPDATE on
// cancel_resolution. Concurrent fires (both clients tick zero simultaneously)
// resolve to a single capture and a single audit row.

import { sql } from '@/lib/db/client';
import { partialCaptureDeposit } from '@/lib/payments/escrow';
import { cascadeRideCancel } from './cancel-cascade';
import { getPlatformConfig } from '@/lib/platform-config/get';

export interface TimeoutResult {
  status: 'cancelled' | 'noop_not_yet' | 'noop_already_resolved' | 'noop_not_requested';
  resolution: string | null;
  visibleDeposit: number;
  platformReceives: number;
  riderRefunded: number;
  ageSeconds: number | null;
  timeoutSeconds: number;
}

export async function resolveCancelTimeout(rideId: string): Promise<TimeoutResult> {
  const cfg = await getPlatformConfig('cancellation.request_timeout_seconds', { value: 180 });
  const timeoutSeconds = Math.max(1, Number(cfg.value) || 180);

  const rideRows = (await sql`
    SELECT id, driver_id, rider_id, hmu_post_id, status, cancel_requested_at,
           cancel_requested_by, cancel_resolution, visible_deposit
    FROM rides WHERE id = ${rideId} LIMIT 1
  `) as Array<{
    id: string;
    driver_id: string | null;
    rider_id: string | null;
    hmu_post_id: string | null;
    status: string;
    cancel_requested_at: Date | null;
    cancel_requested_by: string | null;
    cancel_resolution: string | null;
    visible_deposit: string | number | null;
  }>;

  if (!rideRows.length) {
    return {
      status: 'noop_not_requested', resolution: null, visibleDeposit: 0,
      platformReceives: 0, riderRefunded: 0, ageSeconds: null, timeoutSeconds,
    };
  }

  const ride = rideRows[0];

  if (ride.cancel_resolution) {
    return {
      status: 'noop_already_resolved', resolution: ride.cancel_resolution, visibleDeposit: 0,
      platformReceives: 0, riderRefunded: 0, ageSeconds: null, timeoutSeconds,
    };
  }
  if (!ride.cancel_requested_at) {
    return {
      status: 'noop_not_requested', resolution: null, visibleDeposit: 0,
      platformReceives: 0, riderRefunded: 0, ageSeconds: null, timeoutSeconds,
    };
  }

  const ageMs = Date.now() - new Date(ride.cancel_requested_at).getTime();
  const ageSeconds = Math.floor(ageMs / 1000);
  if (ageSeconds < timeoutSeconds) {
    return {
      status: 'noop_not_yet', resolution: null, visibleDeposit: 0,
      platformReceives: 0, riderRefunded: 0, ageSeconds, timeoutSeconds,
    };
  }

  // Stamp resolution conditionally so a concurrent caller can't double-fire
  // the capture. Whichever caller wins this UPDATE owns the cascade.
  const claimed = (await sql`
    UPDATE rides
    SET cancel_resolution = 'timeout_no_response',
        updated_at = NOW()
    WHERE id = ${rideId}
      AND cancel_resolution IS NULL
      AND cancel_requested_at IS NOT NULL
    RETURNING id
  `) as Array<{ id: string }>;

  if (!claimed.length) {
    // Lost the race; refresh and report what's there.
    const fresh = (await sql`
      SELECT cancel_resolution FROM rides WHERE id = ${rideId} LIMIT 1
    `) as Array<{ cancel_resolution: string | null }>;
    return {
      status: 'noop_already_resolved',
      resolution: fresh[0]?.cancel_resolution ?? null,
      visibleDeposit: 0,
      platformReceives: 0,
      riderRefunded: 0,
      ageSeconds,
      timeoutSeconds,
    };
  }

  const visibleDeposit = round2(Number(ride.visible_deposit ?? 0));
  const feeCfg = await getPlatformConfig('cancellation.timeout_rider_fee_pct', { value: 0.2 });
  const feePct = clamp01(Number(feeCfg.value));
  const platformReceives = round2(visibleDeposit * feePct);
  const riderRefunded = round2(Math.max(0, visibleDeposit - platformReceives));

  // Capture the platform's slice. Driver gets 0 because they didn't engage
  // with the request. Stripe auto-releases the remainder back to the rider.
  if (visibleDeposit > 0 && platformReceives > 0) {
    try {
      await partialCaptureDeposit(rideId, 0, platformReceives);
    } catch (e) {
      console.error('[cancel-timeout] partialCaptureDeposit failed:', e);
      // Continue — money state is recoverable from Stripe + ledger; the
      // cascade still needs to fire so the rider's app moves on.
    }
  } else if (visibleDeposit > 0) {
    // 0% timeout fee — release the whole auth, no money moves.
    try {
      const piRows = (await sql`
        SELECT payment_intent_id FROM rides WHERE id = ${rideId} LIMIT 1
      `) as Array<{ payment_intent_id: string | null }>;
      const piId = piRows[0]?.payment_intent_id;
      if (piId && process.env.STRIPE_MOCK !== 'true') {
        const { stripe } = await import('@/lib/stripe/connect');
        await stripe.paymentIntents.cancel(piId, {}, { idempotencyKey: `cancel_${rideId}` });
      }
      await sql`UPDATE rides SET funds_held = false WHERE id = ${rideId}`;
    } catch (e) {
      console.error('[cancel-timeout] hold release failed:', e);
    }
  }

  // Audit ledger row — distinct from the partialCaptureDeposit ledger
  // entries so admin tooling can filter for "this resolution path was a
  // driver no-response, not a normal cancel".
  try {
    await sql`
      INSERT INTO transaction_ledger (
        ride_id, user_id, user_role, event_type, amount, direction,
        description, stripe_reference
      ) VALUES (
        ${rideId},
        ${ride.driver_id},
        'driver',
        'cancel_timeout_no_response',
        ${platformReceives},
        'audit',
        ${`Driver did not respond to cancel request within ${timeoutSeconds}s. Rider refunded $${riderRefunded.toFixed(2)}; platform fee $${platformReceives.toFixed(2)}; driver $0.`},
        NULL
      )
    `;
  } catch (e) {
    console.error('[cancel-timeout] audit ledger insert failed:', e);
  }

  await cascadeRideCancel({
    ride: {
      id: rideId,
      driver_id: ride.driver_id,
      rider_id: ride.rider_id,
      hmu_post_id: ride.hmu_post_id,
    },
    reason: `Driver didn't respond. Rider refunded $${riderRefunded.toFixed(2)}.`,
    initiator: 'rider',
    resolution: 'timeout_no_response',
    extra: {
      cancelSplit: {
        riderCharged: platformReceives,
        riderRefunded,
        driverReceives: 0,
        platformReceives,
        phase: 'after_otw' as const,
      },
      timeoutSeconds,
    },
  });

  return {
    status: 'cancelled',
    resolution: 'timeout_no_response',
    visibleDeposit,
    platformReceives,
    riderRefunded,
    ageSeconds,
    timeoutSeconds,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
