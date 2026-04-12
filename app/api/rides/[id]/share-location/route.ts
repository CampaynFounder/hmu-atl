import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate, publishAdminEvent } from '@/lib/ably/server';

/**
 * Rider shares their live GPS location in response to a driver request.
 * Updates ride record and publishes to Ably so driver sees the pin.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { lat, lng } = await req.json() as { lat: number; lng: number };

    if (!lat || !lng) {
      return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT driver_id, rider_id, status FROM rides WHERE id = ${rideId} LIMIT 1
    `;
    if (!rideRows.length) return NextResponse.json({ error: 'Ride not found' }, { status: 404 });
    const ride = rideRows[0] as Record<string, unknown>;

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can share location' }, { status: 403 });
    }

    // Update ride with rider's live GPS
    await sql`
      UPDATE rides SET
        rider_lat = ${lat},
        rider_lng = ${lng},
        updated_at = NOW()
      WHERE id = ${rideId}
    `;

    // Publish to ride channel — driver sees pin
    await publishRideUpdate(rideId, 'location_shared', {
      lat, lng,
      sharedBy: userId,
      sharedAt: new Date().toISOString(),
    }).catch(() => {});

    // Log for admin
    await publishAdminEvent('location_shared', {
      rideId,
      riderId: userId,
      driverId: ride.driver_id,
      lat, lng,
      sharedAt: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({ shared: true });
  } catch (error) {
    console.error('Share location error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
