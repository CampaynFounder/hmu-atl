// GET /api/comments/user/[handle]
// Returns the full nested comment tree about a user (driver or rider).
// Public for drivers (shown on browse/booking). Rider subjects are private —
// only authenticated drivers/admins may read them (drivers view riders).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { resolveSubjectByHandle, fetchCommentTree } from '@/lib/comments/profile-comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const { userId: clerkId } = await auth();

  const subject = await resolveSubjectByHandle(handle);
  if (!subject) return NextResponse.json({ comments: [] });

  // Resolve viewer once (used for the privacy gate + `mine`/reaction lookups).
  let viewerUserId: string | null = null;
  let viewerType: string | null = null;
  if (clerkId) {
    const vRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (vRows.length) {
      viewerUserId = (vRows[0] as { id: string }).id;
      viewerType = (vRows[0] as { profile_type: string }).profile_type;
    }
  }

  // Riders are private — only authenticated drivers/admins can view their
  // comments. Exception: you can ALWAYS read the comments left on your OWN
  // profile (this is what powers the in-app "someone commented on you" thread
  // for riders — without it a rider could be pinged but never open the thread).
  if (subject.profile_type === 'rider' && viewerUserId !== subject.id) {
    if (!viewerUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (viewerType !== 'driver' && viewerType !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const comments = await fetchCommentTree(subject.id, viewerUserId);
  return NextResponse.json({ comments });
}
