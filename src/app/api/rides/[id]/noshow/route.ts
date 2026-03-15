import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getRideById, updateRideCancelled, createTransaction } from '@/lib/db/rides';
import { getAblyRest, rideChannel } from '@/lib/ably/client';

const NO_SHOW_WAIT_MINUTES = 10;
const NO_SHOW_FEE_USD = 5;

/**
 * POST /api/rides/[id]/noshow
 * Driver reports rider did not board within 10 minutes of arrival.
 * Allowed from: driver_arrived
 * DB transition: driver_arrived → cancelled (reason: no_show)
 * Charges rider $5 no-show fee
 * Publishes: ride_cancelled + no_show events to ride channel
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: rideId } = await params;

  const ride = await getRideById(rideId);
  if (!ride) {
    return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
  }

  if (ride.driver_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (ride.status !== 'driver_arrived') {
    return NextResponse.json(
      { error: `No-show requires status 'driver_arrived', current: '${ride.status}'` },
      { status: 409 }
    );
  }

  // Enforce minimum 10-minute wait after driver arrived
  if (ride.driver_arrived_at) {
    const waitMs = Date.now() - new Date(ride.driver_arrived_at).getTime();
    const waitMinutes = waitMs / 60_000;
    if (waitMinutes < NO_SHOW_WAIT_MINUTES) {
      const remaining = Math.ceil(NO_SHOW_WAIT_MINUTES - waitMinutes);
      return NextResponse.json(
        { error: `Must wait ${remaining} more minute(s) before declaring no-show` },
        { status: 422 }
      );
    }
  }

  const now = new Date();

  // Cancel ride with no-show reason
  await updateRideCancelled(rideId, userId, 'no_show');

  // Charge rider $5 no-show fee
  await createTransaction({
    userId: ride.rider_id,
    rideId,
    type: 'fee',
    amount: NO_SHOW_FEE_USD,
    status: 'pending',
    description: `No-show fee for ride ${rideId}`,
  });

  // Publish to Ably
  const ably = getAblyRest();
  const channel = ably.channels.get(rideChannel(rideId));
  await channel.publish('ride_cancelled', {
    ride_id: rideId,
    reason: 'no_show',
    cancelled_by: userId,
    no_show_fee_usd: NO_SHOW_FEE_USD,
    cancelled_at: now.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    status: 'cancelled',
    reason: 'no_show',
    fee_charged_usd: NO_SHOW_FEE_USD,
    cancelled_at: now.toISOString(),
  });
}
