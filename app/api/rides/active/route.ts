import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

// GET — check if user has an active ride
export async function GET() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userId = (userRows[0] as { id: string }).id;

    const rideRows = await sql`
      SELECT id, status, driver_id, rider_id
      FROM rides
      WHERE (driver_id = ${userId} OR rider_id = ${userId})
        AND status IN ('pending', 'accepted', 'matched', 'otw', 'here', 'active', 'in_progress', 'ended')
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!rideRows.length) {
      return NextResponse.json({ hasActiveRide: false });
    }

    const ride = rideRows[0] as Record<string, unknown>;
    return NextResponse.json({
      hasActiveRide: true,
      rideId: ride.id,
      status: ride.status,
      isDriver: ride.driver_id === userId,
    });
  } catch (error) {
    console.error('Active ride check error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
