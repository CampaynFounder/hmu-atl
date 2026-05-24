// POST /api/rider/down-bad/[postId]/cancel — rider cancels their Down Bad post.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { notifyUser } from '@/lib/ably/server';

export const runtime = 'nodejs';

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

  const claimed = await sql`
    UPDATE hmu_posts SET status = 'cancelled'
    WHERE id = ${postId}
      AND user_id = ${riderId}
      AND post_type = 'down_bad'
      AND status = 'active'
    RETURNING id
  `;

  if (!claimed.length) {
    // Already cancelled, matched, or expired — idempotent.
    return NextResponse.json({ cancelledAt: new Date().toISOString(), idempotent: true });
  }

  // Notify any driver who had already expressed interest (ride_interests 'interested' rows).
  const interestedRows = await sql`
    SELECT driver_id FROM ride_interests
    WHERE post_id = ${postId} AND status = 'interested'
  `;
  for (const row of interestedRows) {
    notifyUser((row as { driver_id: string }).driver_id, 'down_bad_cancelled', { postId }).catch(() => {});
  }

  return NextResponse.json({ cancelledAt: new Date().toISOString() });
}
