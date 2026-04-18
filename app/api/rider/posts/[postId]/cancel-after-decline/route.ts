import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { cancelTentativeBooking } from '@/lib/schedule/conflicts';

/**
 * Rider closes out a direct booking that the target driver passed on.
 * Flips status to `cancelled` and releases the tentative calendar hold.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const riderId = (userRows[0] as { id: string }).id;

  const result = await sql`
    UPDATE hmu_posts SET status = 'cancelled'
    WHERE id = ${postId}
      AND user_id = ${riderId}
      AND status = 'declined_awaiting_rider'
    RETURNING id
  `;

  if (!result.length) {
    return NextResponse.json({ error: 'Nothing to cancel' }, { status: 404 });
  }

  cancelTentativeBooking(postId).catch(() => {});

  return NextResponse.json({ status: 'cancelled', postId });
}
