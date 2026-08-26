// POST /api/comments/[id]/react
// Toggle a reaction on a comment. Sending the same reaction removes it.
// Any emoji is allowed (Instagram-style) — the old like/heart/haha/dislike
// whitelist is gone (migration 2026-08-26-comment-reactions-any-emoji.sql).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The web ride-comments UI (components/hmu/comments/CommentsSection.tsx) still
// posts these four word reactions — keep accepting them so it doesn't regress.
const LEGACY_WORD_REACTIONS = new Set(['like', 'heart', 'haha', 'dislike']);

// Accept either a legacy word reaction OR a single emoji (incl. ZWJ sequences +
// skin-tone modifiers) — and nothing else (no arbitrary text, no long strings).
function normalizeReaction(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const r = raw.trim();
  if (!r || r.length > 16) return null;
  if (LEGACY_WORD_REACTIONS.has(r)) return r;
  // Emoji path: no letters/digits, at least one pictographic code point, and a
  // small cap on distinct code points so we can't be handed a wall of emoji.
  if (/[\p{L}\p{N}]/u.test(r)) return null;
  if (!/\p{Extended_Pictographic}/u.test(r)) return null;
  if ([...r].length > 8) return null;
  return r;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: commentId } = await params;
  const body = await req.json().catch(() => ({}));
  const reaction = normalizeReaction((body as { reaction?: unknown }).reaction);
  if (!reaction) {
    return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 });
  }

  const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const userId = (userRows[0] as { id: string }).id;

  // Check if comment exists and is visible
  const commentRows = await sql`SELECT id FROM comments WHERE id = ${commentId} AND is_visible = true LIMIT 1`;
  if (!commentRows.length) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

  // Get existing reaction
  const existing = await sql`
    SELECT reaction FROM comment_reactions WHERE comment_id = ${commentId} AND user_id = ${userId} LIMIT 1
  `;

  if (existing.length && (existing[0] as { reaction: string }).reaction === reaction) {
    // Same reaction — remove it (toggle off)
    await sql`DELETE FROM comment_reactions WHERE comment_id = ${commentId} AND user_id = ${userId}`;
    return NextResponse.json({ removed: true });
  }

  // Upsert reaction (change or add)
  await sql`
    INSERT INTO comment_reactions (comment_id, user_id, reaction)
    VALUES (${commentId}, ${userId}, ${reaction})
    ON CONFLICT (comment_id, user_id) DO UPDATE SET reaction = ${reaction}, created_at = NOW()
  `;

  return NextResponse.json({ reaction });
}
