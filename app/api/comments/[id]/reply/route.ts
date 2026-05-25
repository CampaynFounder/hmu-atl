// POST /api/comments/[id]/reply
// Reply to a top-level comment. One level deep only.
// Only the comment's subject can reply (their side of the story).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: parentId } = await params;
  const body = await req.json();
  const content: string = (body.content ?? '').trim();

  if (!content || content.length > 500) {
    return NextResponse.json({ error: 'Content must be 1–500 characters' }, { status: 400 });
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  // Parent must be a top-level comment (no nested replies)
  const parentRows = await sql`
    SELECT id, subject_id, author_id, parent_id FROM comments WHERE id = ${parentId} AND is_visible = true LIMIT 1
  `;
  if (!parentRows.length) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  const parent = parentRows[0] as { id: string; subject_id: string; author_id: string; parent_id: string | null };

  if (parent.parent_id !== null) {
    return NextResponse.json({ error: 'Cannot reply to a reply' }, { status: 400 });
  }

  // Only the subject of the comment (or the original author) can reply
  if (userId !== parent.subject_id && userId !== parent.author_id) {
    return NextResponse.json({ error: 'Only the comment subject or author can reply' }, { status: 403 });
  }

  const result = await sql`
    INSERT INTO comments (parent_id, author_id, subject_id, content, is_visible, flagged_for_review)
    VALUES (${parentId}, ${userId}, ${parent.subject_id}, ${content}, true, false)
    RETURNING id, created_at
  `;

  return NextResponse.json({ id: (result[0] as { id: string }).id }, { status: 201 });
}
