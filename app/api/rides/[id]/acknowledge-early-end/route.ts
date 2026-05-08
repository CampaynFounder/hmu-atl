import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, notifyUser, publishAdminEvent } from '@/lib/ably/server';

// Soft-confirmation: rider acknowledges or disputes the driver's
// early_end_reason. Required step before rating when the ride was ended
// before reaching the dropoff. See docs/RIDE_FLOW.md / memory
// money_movement_canonical for context.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json().catch(() => ({}));
    const acknowledged = body.acknowledged;

    if (typeof acknowledged !== 'boolean') {
      return NextResponse.json({ error: 'acknowledged must be true or false' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT rider_id, driver_id, status, early_end_reason, rider_acknowledged_early_end
      FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can acknowledge' }, { status: 403 });
    }
    if (!ride.early_end_reason) {
      return NextResponse.json({ error: 'No early-end reason to acknowledge' }, { status: 400 });
    }
    if (ride.rider_acknowledged_early_end !== null && ride.rider_acknowledged_early_end !== undefined) {
      // Already responded — idempotent return so a double-tap doesn't error.
      return NextResponse.json({ success: true, acknowledged: ride.rider_acknowledged_early_end, alreadyAcknowledged: true });
    }

    if (acknowledged) {
      await sql`
        UPDATE rides
        SET rider_acknowledged_early_end = true,
            rider_acknowledged_at = NOW(),
            updated_at = NOW()
        WHERE id = ${rideId}
      `;
    } else {
      // Decline = dispute. Move to 'disputed' so admin queue picks it up.
      await sql`
        UPDATE rides
        SET rider_acknowledged_early_end = false,
            rider_acknowledged_at = NOW(),
            status = 'disputed',
            updated_at = NOW()
        WHERE id = ${rideId} AND status IN ('ended', 'completed')
      `;
      publishAdminEvent('early_end_disputed', {
        rideId,
        riderId: userId,
        driverId: ride.driver_id,
        earlyEndReason: ride.early_end_reason,
      }).catch(() => {});
      await notifyUser(ride.driver_id as string, 'ride_update', {
        rideId,
        status: 'disputed',
        message: 'Rider disputed the early-end reason — admin will review.',
      }).catch(() => {});
    }

    await publishRideUpdate(rideId, 'early_end_acknowledgement', {
      acknowledged,
      status: acknowledged ? ride.status : 'disputed',
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      acknowledged,
      status: acknowledged ? ride.status : 'disputed',
    });
  } catch (error) {
    console.error('Acknowledge early-end error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
