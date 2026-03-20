import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const body = await req.json();
    const { lat, lng, locationText } = body as {
      lat?: number;
      lng?: number;
      locationText?: string;
    };

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can send COO' }, { status: 403 });
    }

    if (ride.status !== 'matched') {
      return NextResponse.json({ error: `Cannot COO from status: ${ride.status}` }, { status: 400 });
    }

    // Update ride with rider location and COO status
    await sql`
      UPDATE rides SET
        coo_at = NOW(),
        rider_lat = ${lat || null},
        rider_lng = ${lng || null},
        rider_location_text = ${locationText || null},
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'matched'
    `;

    // Notify driver with rider's location
    await publishRideUpdate(rideId, 'coo', {
      status: 'coo',
      riderLat: lat,
      riderLng: lng,
      riderLocation: locationText,
      message: 'Rider is ready — COO! Payment authorized.',
    }).catch(() => {});

    await notifyUser(ride.driver_id as string, 'ride_update', {
      rideId,
      status: 'coo',
      riderLat: lat,
      riderLng: lng,
      riderLocation: locationText,
      message: 'Rider says COO — payment ready, location shared',
    }).catch(() => {});

    return NextResponse.json({ status: 'coo', rideId });
  } catch (error) {
    console.error('COO error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
