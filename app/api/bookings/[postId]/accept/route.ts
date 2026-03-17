import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

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
    SELECT * FROM hmu_posts
    WHERE id = ${postId}
      AND post_type = 'direct_booking'
      AND target_driver_id = ${driverUserId}
      AND status = 'active'
      AND booking_expires_at > NOW()
    LIMIT 1
  `;

  if (!postRows.length) {
    return NextResponse.json({ error: 'Booking not found or expired' }, { status: 404 });
  }

  await sql`UPDATE hmu_posts SET status = 'matched' WHERE id = ${postId}`;

  // TODO: Ably notification to rider user:{post.user_id}:notify

  return NextResponse.json({ status: 'matched' });
}
