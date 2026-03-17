import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRiderEligibility } from '@/lib/db/direct-bookings';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { handle } = await params;

  // Resolve internal user IDs
  const [riderRows, driverRows] = await Promise.all([
    sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`,
    sql`SELECT user_id FROM driver_profiles WHERE handle = ${handle} LIMIT 1`,
  ]);

  if (!riderRows.length) return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
  if (!driverRows.length) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

  const riderId = (riderRows[0] as { id: string }).id;
  const driverUserId = (driverRows[0] as { user_id: string }).user_id;

  const result = await checkRiderEligibility(riderId, driverUserId);
  return NextResponse.json(result);
}
