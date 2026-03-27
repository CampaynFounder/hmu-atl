import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { notifyUser } from '@/lib/ably/server';
import { notifyRiderBookingDeclined } from '@/lib/sms/textbee';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const driverUserId = (userRows[0] as { id: string }).id;

  const postRows = await sql`
    SELECT id, user_id FROM hmu_posts
    WHERE id = ${postId}
      AND post_type = 'direct_booking'
      AND target_driver_id = ${driverUserId}
      AND status = 'active'
    LIMIT 1
  `;

  if (!postRows.length) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const riderId = (postRows[0] as Record<string, unknown>).user_id as string;

  await sql`UPDATE hmu_posts SET status = 'cancelled' WHERE id = ${postId}`;

  // Get driver name for notification
  const driverNameRows = await sql`SELECT handle FROM driver_profiles WHERE user_id = ${driverUserId} LIMIT 1`;
  const driverName = (driverNameRows[0] as Record<string, unknown>)?.handle as string || 'The driver';

  // Ably notification to rider
  notifyUser(riderId, 'booking_declined', {
    postId,
    driverName,
    message: `${driverName} passed on your request. Try another driver.`,
  }).catch(() => {});

  // SMS notification to rider
  try {
    const riderPhoneRows = await sql`SELECT phone FROM rider_profiles WHERE user_id = ${riderId} LIMIT 1`;
    const riderPhone = (riderPhoneRows[0] as Record<string, unknown>)?.phone as string;
    if (riderPhone) {
      notifyRiderBookingDeclined(riderPhone, driverName).catch(() => {});
    }
  } catch { /* non-blocking */ }

  return NextResponse.json({ status: 'cancelled' });
}
