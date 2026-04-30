// Rider-side profile-view tracking. Called from the driver browse + driver
// profile pages whenever a rider opens a driver's profile. Counter is
// race-safe (atomic upsert in lib/profile-views/track.ts).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { recordProfileView } from '@/lib/profile-views/track';

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const driverHandle = typeof body.driverHandle === 'string' ? body.driverHandle.trim() : '';
  const driverIdInput = typeof body.driverId === 'string' ? body.driverId.trim() : '';
  if (!driverHandle && !driverIdInput) {
    return NextResponse.json({ error: 'Missing driverHandle or driverId' }, { status: 400 });
  }

  // Resolve rider's user_id (the viewer).
  const riderRows = await sql`
    SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1
  `;
  if (riderRows.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const riderId = riderRows[0].id as string;

  // Resolve driver user_id from handle or accept it directly.
  let driverId: string;
  if (driverIdInput) {
    driverId = driverIdInput;
  } else {
    const drvRows = await sql`
      SELECT user_id FROM driver_profiles WHERE handle = ${driverHandle} LIMIT 1
    `;
    if (drvRows.length === 0) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }
    driverId = drvRows[0].user_id as string;
  }

  const result = await recordProfileView(riderId, driverId);
  return NextResponse.json(result);
}
