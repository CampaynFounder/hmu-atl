import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { partialCaptureNoShow, cancelPaymentHold } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';
import { getHoldPolicy, calculateNoShowSplit } from '@/lib/payments/hold-policy';
import { cascadeRideCancel } from '@/lib/rides/cancel-cascade';

/**
 * Driver pulls off / marks rider as no-show.
 * Only available from 'here' or 'confirming' status.
 *
 * chargePercent: 0 (cancel, full refund), 25, or 50
 * - 25%: driver gets 25%, platform 5%, rider refunded 70% + add-ons
 * - 50%: driver gets 50%, platform 10%, rider refunded 40% + add-ons
 * - 0%: full refund, no charge
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const { chargePercent, driverLat, driverLng } = body as {
      chargePercent: number;
      driverLat?: number;
      driverLng?: number;
    };

    if (![0, 25, 50].includes(chargePercent)) {
      return NextResponse.json({ error: 'chargePercent must be 0, 25, or 50' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can pull off' }, { status: 403 });
    }

    if (!['here', 'confirming'].includes(ride.status as string)) {
      return NextResponse.json({ error: 'Can only pull off from HERE or CONFIRMING status' }, { status: 400 });
    }

    // Check if driver ETA was stale (went offline) — block no-show charge if so
    if (chargePercent > 0) {
      const lastLocRows = await sql`
        SELECT recorded_at FROM ride_locations
        WHERE ride_id = ${rideId} AND user_id = ${userId}
        ORDER BY recorded_at DESC LIMIT 1
      `;
      if (lastLocRows.length) {
        const lastLocTime = new Date((lastLocRows[0] as Record<string, unknown>).recorded_at as string).getTime();
        const staleDuration = Date.now() - lastLocTime;
        // If driver's last location update was >2 min ago, they were offline — can't charge rider
        if (staleDuration > 2 * 60 * 1000) {
          return NextResponse.json({
            error: 'Your ETA was offline for over 2 minutes — rider can\'t be charged a no-show fee. You can still cancel the ride.',
            code: 'driver_eta_stale',
          }, { status: 400 });
        }
      }
    }

    // Save driver GPS
    await sql`
      UPDATE rides SET
        pulloff_at = NOW(),
        pulloff_driver_lat = ${driverLat || null},
        pulloff_driver_lng = ${driverLng || null},
        updated_at = NOW()
      WHERE id = ${rideId}
    `;

    let result = { captured: 0, driverReceives: 0, platformReceives: 0, riderRefunded: 0, addOnRefunded: 0 };
    let noShowSplit = null;

    if (chargePercent === 0) {
      // Full cancel — release hold + run the shared cancel cascade so
      // both sides get realtime cleanup (status_change publish, banner
      // clear, calendar release, post reactivation, etc). Without the
      // cascade, the rider's UI stays stuck on "driver is reviewing"
      // until refresh.
      await cancelPaymentHold(rideId, 'Driver pulled off — no charge');
      await cascadeRideCancel({
        ride: {
          id: rideId,
          driver_id: ride.driver_id as string | null,
          rider_id: ride.rider_id as string | null,
          hmu_post_id: (ride.hmu_post_id as string | null) ?? null,
        },
        reason: 'Driver pulled off — no charge',
        initiator: 'driver',
        resolution: 'driver_pre_otw',
      });
    } else {
      // Use hold policy progressive tiers for no-show split
      const driverTierRows = await sql`SELECT tier FROM users WHERE id = ${ride.driver_id} LIMIT 1`;
      const driverTier = ((driverTierRows[0] as Record<string, unknown>)?.tier as string) || 'free';
      const holdPolicy = await getHoldPolicy(driverTier);

      if (holdPolicy.noShowPlatformTiers?.length > 0) {
        // Progressive no-show: charge full ride, platform takes tiered cut
        const ridePrice = Number(ride.final_agreed_price || ride.amount || 0);
        noShowSplit = calculateNoShowSplit(ridePrice, holdPolicy);

        // Use partialCaptureNoShow with the policy-calculated amounts
        // chargePercent still controls whether it's 25% or 50% of the base fare for Stripe capture
        result = await partialCaptureNoShow(rideId, chargePercent as 25 | 50);

        // Override result with progressive split if the no-show charges the full amount
        // The partialCaptureNoShow handles Stripe; we augment the response with policy info
        result.platformReceives = noShowSplit.platformReceives;
        result.driverReceives = noShowSplit.driverReceives;
      } else {
        // Fallback: old hardcoded 25/50 split
        result = await partialCaptureNoShow(rideId, chargePercent as 25 | 50);
      }
    }

    const message = chargePercent === 0
      ? 'Driver pulled off — ride cancelled, no charge.'
      : `No-show: Driver earned $${result.driverReceives.toFixed(2)}. Platform: $${result.platformReceives.toFixed(2)}.`;

    await publishRideUpdate(rideId, 'ride_ended', {
      status: chargePercent === 0 ? 'cancelled' : 'ended',
      pulloff: true,
      noShow: chargePercent > 0,
      chargePercent,
      ...result,
      message,
    }).catch(() => {});

    const riderMessage = chargePercent === 0
      ? 'Ride cancelled by driver — no charge.'
      : `No-show fee: $${result.captured.toFixed(2)} charged (${chargePercent}%). $${result.riderRefunded.toFixed(2)} refunded.`;

    await notifyUser(ride.rider_id as string, 'ride_update', {
      rideId,
      status: chargePercent === 0 ? 'cancelled' : 'ended',
      pulloff: true,
      chargePercent,
      message: riderMessage,
    }).catch(() => {});

    // Cancel calendar booking + linked post. If this was a no-show charge,
    // tag the booking as 'no_show' (not plain 'cancelled') so analytics and
    // history show the difference.
    const { cancelRideBooking } = await import('@/lib/schedule/conflicts');
    cancelRideBooking(rideId, { noShow: chargePercent > 0 }).catch(() => {});
    if (ride.hmu_post_id) {
      await sql`UPDATE hmu_posts SET status = 'cancelled' WHERE id = ${ride.hmu_post_id}`.catch(() => {});
    }

    return NextResponse.json({
      status: chargePercent === 0 ? 'cancelled' : 'ended',
      chargePercent,
      ...result,
      ...(noShowSplit ? { noShowBreakdown: noShowSplit.tierBreakdown, effectiveRate: noShowSplit.effectiveRate } : {}),
    });
  } catch (error) {
    console.error('Pulloff error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
