import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, publishAdminEvent } from '@/lib/ably/server';

/**
 * Driver requests the rider's live GPS location.
 * Sends an Ably event to the rider. Logged for admin dispute context.
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

    if (ride.driver_id !== userId) {
      return NextResponse.json({ error: 'Only the driver can request location' }, { status: 403 });
    }

    if (!['otw', 'here'].includes(ride.status as string)) {
      return NextResponse.json({ error: 'Can only request location during OTW or HERE' }, { status: 400 });
    }

    // Publish to ride channel — rider sees prompt
    await publishRideUpdate(rideId, 'location_request', {
      requestedBy: userId,
      requestedAt: new Date().toISOString(),
    }).catch(() => {});

    // Log for admin — useful for dispute resolution
    await publishAdminEvent('location_request', {
      rideId,
      driverId: userId,
      riderId: ride.rider_id,
      status: ride.status,
      requestedAt: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({ requested: true });
  } catch (error) {
    console.error('Request location error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
