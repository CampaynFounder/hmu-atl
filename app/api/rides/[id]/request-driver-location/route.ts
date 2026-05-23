import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate } from '@/lib/ably/server';

/**
 * Rider asks the driver for their live GPS / ETA.
 * Publishes a `driver_location_requested` event to the ride channel so the
 * driver's client can vibrate + show a banner. The driver is already
 * streaming GPS via the location posting interval, so no explicit action is
 * needed — the next GPS update will immediately update the rider's ETA.
 *
 * Allowed statuses: matched, otw, here, confirming
 * Rate-limited at the app layer: one ping allowed per 15 seconds (enforced
 * client-side via the 15s reset timeout; no server-side counter needed for MVP).
 */
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

    const rideRows = await sql`
      SELECT driver_id, rider_id, status FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can request driver location' }, { status: 403 });
    }

    const allowedStatuses = ['matched', 'otw', 'here', 'confirming'];
    if (!allowedStatuses.includes(ride.status as string)) {
      return NextResponse.json({ error: 'Location request not available at this stage' }, { status: 400 });
    }

    await publishRideUpdate(rideId, 'driver_location_requested', {
      requestedBy: userId,
      requestedAt: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({ requested: true });
  } catch (error) {
    console.error('Request driver location error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
