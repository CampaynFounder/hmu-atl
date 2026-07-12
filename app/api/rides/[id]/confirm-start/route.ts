import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { captureRiderPayment } from '@/lib/payments/escrow';
import { maybeCapturePartnerHold } from '@/lib/partner/booking-capture';
import { publishRideUpdate } from '@/lib/ably/server';
import { notifyUserWithPush } from '@/lib/notify';
import { syncBookingFromRide } from '@/lib/schedule/conflicts';
import { getPlatformConfig } from '@/lib/platform-config/get';
import { afterResponse } from '@/lib/runtime/after-response';

/**
 * Rider confirms they're in the car → capture payment → ride active.
 * Called after driver taps "Start Ride" and ride is in "confirming" status.
 *
 * Per founder direction (2026-05-08), this endpoint requires:
 *   1. The rider's explicit tap (no silent auto-confirm path).
 *   2. Rider GPS coordinates at tap time, as supplementary chargeback
 *      evidence (stored in rides.rider_start_lat / rider_start_lng).
 *
 * `autoConfirmed: true` from clients is rejected — older builds shipped a
 * timeout-only auto-confirm that bypassed rider consent. Defense in depth:
 * if a stale client still sends it, we 400 instead of capturing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    let riderLat: number | null = null;
    let riderLng: number | null = null;
    let bodyAutoConfirmed = false;
    try {
      const body = await req.json();
      riderLat = body.lat ?? body.riderLat ?? null;
      riderLng = body.lng ?? body.riderLng ?? null;
      bodyAutoConfirmed = body.autoConfirmed ?? false;
    } catch { /* no body is ok */ }

    if (bodyAutoConfirmed) {
      return NextResponse.json(
        { error: 'Auto-confirm is not accepted. The rider must tap to confirm they\'re in the car.' },
        { status: 400 }
      );
    }

    if (typeof riderLat !== 'number' || typeof riderLng !== 'number') {
      return NextResponse.json(
        { error: 'Location required to confirm. Enable GPS and tap again.' },
        { status: 400 }
      );
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    // Only the rider can confirm start
    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can confirm ride start' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'active')) {
      return NextResponse.json({ error: `Cannot confirm from status: ${ride.status}` }, { status: 400 });
    }

    // Idempotency: if already captured, don't capture again
    if (ride.payment_captured) {
      return NextResponse.json({ status: 'active', rideId, alreadyCaptured: true });
    }

    // Capture payment (digital rides only)
    let captureResult = { driverReceives: 0, platformReceives: 0, capHit: false, waivedFee: 0, offerActive: false, offerProgress: null as unknown, offerJustExhausted: false };
    const isCashRide = !!(ride.is_cash);

    if (!isCashRide && ride.payment_intent_id && ride.funds_held) {
      // Generate idempotency key for this capture
      const idempotencyKey = `capture_${rideId}_${Date.now()}`;
      await sql`UPDATE rides SET capture_idempotency_key = ${idempotencyKey} WHERE id = ${rideId} AND capture_idempotency_key IS NULL`;

      // Partner delivery rides capture with the delivery-fee split (not the
      // ride's tiered fee). maybeCapturePartnerHold returns handled:false for
      // normal rides, so they fall through to the standard capture.
      const partnerCapture = await maybeCapturePartnerHold(rideId);
      if (partnerCapture.handled) {
        captureResult = {
          ...captureResult,
          driverReceives: partnerCapture.driverReceives ?? 0,
          platformReceives: partnerCapture.platformFee ?? 0,
        };
      } else {
        captureResult = await captureRiderPayment(rideId);
      }
    }

    // Transition to active. auto_confirmed is always false now — rider must
    // tap (this endpoint rejects the auto path above).
    await sql`
      UPDATE rides SET
        status = 'active',
        started_at = COALESCE(started_at, NOW()),
        rider_confirmed_start = true,
        rider_start_lat = ${riderLat},
        rider_start_lng = ${riderLng},
        auto_confirmed = false,
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'confirming'
    `;

    syncBookingFromRide(rideId, 'active').catch(() => {});

    // Down Bad facilitation fee — log at ride activation (non-blocking).
    // The fee is tracked in transaction_ledger for revenue reporting;
    // actual collection is handled separately once payments are fully live.
    recordDownBadFacilitationFee(rideId, ride).catch(() => {});

    // Notify both parties — off the response path. The capture above already
    // committed; the driver's live screen flips via this Ably event a beat
    // after the rider's tap returns, instead of the rider waiting on it.
    afterResponse(async () => {
      await publishRideUpdate(rideId, 'status_change', {
        status: 'active',
        message: 'Rider confirmed — ride is active',
        captured: !isCashRide,
        driverReceives: captureResult.driverReceives,
      }).catch(() => {});

      await notifyUserWithPush(ride.driver_id as string, 'ride_update', {
        rideId,
        status: 'active',
        message: 'Rider confirmed — ride is active!',
      }, {
        title: 'Ride started ✅',
        body: 'Your rider confirmed — the ride is active.',
        data: { type: 'ride_update', rideId, status: 'active' },
      }).catch(() => {});
    });

    return NextResponse.json({
      status: 'active',
      rideId,
      captured: !isCashRide,
      autoConfirmed: false,
      driverReceives: captureResult.driverReceives,
      platformFee: captureResult.platformReceives,
      capHit: captureResult.capHit,
      waivedFee: captureResult.waivedFee,
      offerActive: captureResult.offerActive,
    });
  } catch (error) {
    console.error('Confirm start error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm ride start' },
      { status: 500 }
    );
  }
}

// ── Down Bad facilitation fee ─────────────────────────────────────────────────
// Logs a `down_bad_facilitation_fee` row in transaction_ledger when the ride
// originated from a down_bad post. The fee = flat + pct of agreed price.
// Non-blocking — caller must .catch(() => {}).
async function recordDownBadFacilitationFee(
  rideId: string,
  ride: Record<string, unknown>
): Promise<void> {
  if (!ride.hmu_post_id) return;

  // Confirm the post is actually a down_bad post.
  const postRows = await sql`
    SELECT id FROM hmu_posts
    WHERE id = ${ride.hmu_post_id as string} AND post_type = 'down_bad'
    LIMIT 1
  `;
  if (!postRows.length) return;

  // Fetch fee config — default to flat $0.50 + 0% if config not set.
  const rawConfig = await getPlatformConfig('down_bad.config', {
    fee_flat_cents: 50,
    fee_pct: 0,
  } as Record<string, unknown>);
  const cfg = rawConfig as { fee_flat_cents: number; fee_pct: number };

  const price = Number(ride.final_agreed_price || ride.amount || 0);
  const feeCents = Math.round(cfg.fee_flat_cents + (price * 100 * (cfg.fee_pct / 100)));
  if (feeCents <= 0) return;

  const feeAmount = feeCents / 100;
  const riderId = ride.rider_id as string;
  const driverId = ride.driver_id as string;

  await Promise.all([
    sql`
      INSERT INTO transaction_ledger (
        ride_id, user_id, user_role, event_type, amount, direction, description, stripe_reference
      ) VALUES (
        ${rideId}, ${riderId}, 'rider',
        'down_bad_facilitation_fee',
        ${feeAmount}, 'debit',
        ${`Down Bad facilitation fee — $${feeAmount.toFixed(2)} (flat $${(cfg.fee_flat_cents / 100).toFixed(2)} + ${cfg.fee_pct}% of $${price.toFixed(2)})`},
        NULL
      )
    `,
    sql`
      INSERT INTO transaction_ledger (
        ride_id, user_id, user_role, event_type, amount, direction, description, stripe_reference
      ) VALUES (
        ${rideId}, ${driverId}, 'platform',
        'down_bad_facilitation_fee',
        ${feeAmount}, 'credit',
        ${`Down Bad facilitation fee collected — $${feeAmount.toFixed(2)}`},
        NULL
      )
    `,
  ]);

  console.log(`[down_bad_fee] ride=${rideId} fee=$${feeAmount.toFixed(2)}`);
}
