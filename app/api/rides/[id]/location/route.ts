import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { publishRideUpdate } from '@/lib/ably/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: rideId } = await params;
    const { lat, lng } = await req.json();

    if (!lat || !lng) {
      return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
    }

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    // Verify user is part of this ride and ride is active
    const rideRows = await sql`
      SELECT status FROM rides
      WHERE id = ${rideId} AND (driver_id = ${userId} OR rider_id = ${userId})
      AND status IN ('otw', 'here', 'confirming', 'active')
      LIMIT 1
    `;
    if (!rideRows.length) {
      return NextResponse.json({ error: 'No active ride found' }, { status: 404 });
    }

    await sql`
      INSERT INTO ride_locations (ride_id, user_id, lat, lng)
      VALUES (${rideId}, ${userId}, ${lat}, ${lng})
    `;

    // Publish location to ride channel for real-time map
    await publishRideUpdate(rideId, 'location', { userId, lat, lng, timestamp: Date.now() }).catch(() => {});

    return NextResponse.json({ saved: true });
  } catch (error) {
    console.error('Location error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
