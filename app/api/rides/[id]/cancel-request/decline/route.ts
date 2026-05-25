// Driver actively declines a rider's post-OTW cancel request and elects to
// keep the deposit as a cancellation fee. Ride cancels regardless — the
// rider asked for it — but the driver is compensated for showing up.
//
// Money:
//   Capture amount        = visible_deposit (full)
//   Platform application  = visible_deposit × cancellation.decline_platform_fee_pct
//                           (default 0 — driver keeps 100%, platform earns from
//                            real rides, not cancels. Admin-configurable.)
//   Driver receives       = visible_deposit − platform application
//   Rider refunded        = 0 (the rest of the auth above visible_deposit
//                              auto-releases via Stripe partial capture)
//
// State:
//   rides.cancel_resolution = 'driver_declined_kept_deposit'
//   rides.status            = 'cancelled' (set by cascade)
//   transaction_ledger      = capture-related rows from partialCaptureDeposit
//
// Realtime:
//   Cascade publishes status_change to ride:{id} with cancelSplit so the
//   rider's UI shows "Driver kept the deposit ($X)" and the driver's UI
//   confirms the capture amount.
//
// Idempotent on repeat — if cancel_resolution is already set, returns 200
// with the existing resolution.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { partialCaptureDeposit } from '@/lib/payments/escrow';
import { cascadeRideCancel, type CancellableRide } from '@/lib/rides/cancel-cascade';
import { getPlatformConfig } from '@/lib/platform-config/get';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);
    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the matched driver can decline this request' }, { status: 403 });
    }

    // Idempotent: already resolved.
    if (ride.cancel_resolution) {
      return NextResponse.json({
        status: 'cancelled',
        resolution: ride.cancel_resolution,
        idempotent: true,
      });
    }

    if (!ride.cancel_requested_at) {
      return NextResponse.json({ error: 'No cancel request to decline' }, { status: 400 });
    }
    if (!['otw', 'here'].includes(ride.status as string)) {
      return NextResponse.json({ error: 'Ride is no longer in a state that can be declined' }, { status: 400 });
    }

    const visibleDeposit = Number(ride.visible_deposit ?? 0);
    if (visibleDeposit <= 0) {
      // Edge case: free ride or no deposit was held. There's nothing to
      // capture — fall through to a cascade with zero amounts.
      await cascadeRideCancel({
        ride: rideToCancellable(ride, rideId),
        reason: 'Driver declined the cancel request — no deposit to keep.',
        initiator: 'driver',
        resolution: 'driver_declined_kept_deposit',
        extra: { cancelSplit: { riderCharged: 0, riderRefunded: 0, driverReceives: 0, platformReceives: 0, phase: 'after_otw' } },
      });
      return NextResponse.json({ status: 'cancelled', resolution: 'driver_declined_kept_deposit', driverReceives: 0 });
    }

    // Read platform fee fraction. Default 0 (driver keeps 100% of deposit).
    const cfg = await getPlatformConfig('cancellation.decline_platform_fee_pct', { value: 0 });
    const platformPct = clamp01(Number(cfg.value));
    const platformReceives = round2(visibleDeposit * platformPct);
    const driverReceives = round2(visibleDeposit - platformReceives);

    // Capture the deposit. partialCaptureDeposit handles ledger entries and
    // Stripe partial capture (releasing the unused authorization remainder).
    try {
      await partialCaptureDeposit(rideId, driverReceives, platformReceives);
    } catch (e) {
      console.error('[cancel-request/decline] partialCaptureDeposit failed:', e);
      // Don't bail — the rider asked for cancel and we owe them at minimum
      // the cascade. Money state is recoverable from Stripe + ledger.
    }

    const cancelSplit = {
      riderCharged: visibleDeposit,
      riderRefunded: 0,
      driverReceives,
      platformReceives,
      phase: 'after_otw' as const,
    };

    const msg = `Driver declined the cancel request and kept the $${visibleDeposit.toFixed(2)} deposit as a cancellation fee.`;

    await cascadeRideCancel({
      ride: rideToCancellable(ride, rideId),
      reason: msg,
      initiator: 'driver',
      resolution: 'driver_declined_kept_deposit',
      extra: { cancelSplit },
    });

    return NextResponse.json({
      status: 'cancelled',
      resolution: 'driver_declined_kept_deposit',
      driverReceives,
      platformReceives,
      visibleDeposit,
    });
  } catch (error) {
    console.error('cancel-request/decline error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to decline cancel request' },
      { status: 500 }
    );
  }
}

function rideToCancellable(ride: Record<string, unknown>, rideId: string): CancellableRide {
  return {
    id: rideId,
    driver_id: (ride.driver_id as string | null) ?? null,
    rider_id: (ride.rider_id as string | null) ?? null,
    hmu_post_id: (ride.hmu_post_id as string | null) ?? null,
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
