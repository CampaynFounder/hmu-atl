import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getRideForUser, validateTransition } from '@/lib/rides/state-machine';
import { publishRideUpdate, notifyUser } from '@/lib/ably/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;

    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const body = await req.json();
      lat = body.lat || null;
      lng = body.lng || null;
    } catch { /* no body is ok */ }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const ride = await getRideForUser(rideId, userId);

    if (ride.rider_id !== userId) {
      return NextResponse.json({ error: 'Only the rider can start the ride' }, { status: 403 });
    }

    if (!validateTransition(ride.status as string, 'active')) {
      return NextResponse.json({ error: `Cannot start ride from status: ${ride.status}` }, { status: 400 });
    }

    await sql`
      UPDATE rides SET
        status = 'active',
        started_at = COALESCE(started_at, NOW()),
        rider_confirmed_start = true,
        rider_start_lat = ${lat},
        rider_start_lng = ${lng},
        updated_at = NOW()
      WHERE id = ${rideId} AND status = 'here'
    `;

    await publishRideUpdate(rideId, 'status_change', { status: 'active', message: 'Ride is active' }).catch(() => {});
    await notifyUser(ride.driver_id as string, 'ride_update', { rideId, status: 'active', message: 'Rider is in — ride started!' }).catch(() => {});

    return NextResponse.json({ status: 'active', rideId });
  } catch (error) {
    console.error('Start ride error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
