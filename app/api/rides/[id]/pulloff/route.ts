import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { partialCaptureNoShow, cancelPaymentHold } from '@/lib/payments/escrow';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

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

    if (chargePercent === 0) {
      // Full cancel — release hold
      await cancelPaymentHold(rideId, 'Driver pulled off — no charge');
    } else {
      // Partial capture for no-show
      result = await partialCaptureNoShow(rideId, chargePercent as 25 | 50);
    }

    const message = chargePercent === 0
      ? 'Driver pulled off — ride cancelled, no charge.'
      : `No-show: ${chargePercent}% fee charged. Driver earned $${result.driverReceives.toFixed(2)}.`;

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

    return NextResponse.json({
      status: chargePercent === 0 ? 'cancelled' : 'ended',
      chargePercent,
      ...result,
    });
  } catch (error) {
    console.error('Pulloff error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
