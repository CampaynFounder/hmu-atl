// POST /api/comments/profile
// Leave a comment on a driver/rider profile (not tied to a ride). Supports
// nested replies via parentId (arbitrary depth). Any signed-in user may
// comment or reply. Rate-limited; content capped by comments.settings.maxChars.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { notifyUser } from '@/lib/ably/server';
import { notifyUserWithPush } from '@/lib/notify';
import { resolveSubjectByHandle } from '@/lib/comments/profile-comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MAX_CHARS = 300;

async function getMaxChars(): Promise<number> {
  const rows = await sql`SELECT config_value FROM platform_config WHERE config_key = 'comments.settings' LIMIT 1`;
  const v = (rows[0]?.config_value as Record<string, number> | undefined) ?? {};
  return v.maxChars ?? DEFAULT_MAX_CHARS;
}

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      subjectHandle?: string;
      content?: string;
      parentId?: string | null;
    };
    const subjectHandle = (body.subjectHandle ?? '').trim();
    const content = (body.content ?? '').trim();
    const parentId = body.parentId ?? null;

    if (!subjectHandle) return NextResponse.json({ error: 'subjectHandle required' }, { status: 400 });

    const maxChars = await getMaxChars();
    if (!content || content.length > maxChars) {
      return NextResponse.json({ error: `Content must be 1–${maxChars} characters` }, { status: 400 });
    }

    const authorRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (!authorRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const authorId = (authorRows[0] as { id: string }).id;

    // Rate limit: 10 comments / minute per author.
    const rl = await checkRateLimit({ key: `comment:${authorId}`, limit: 10, windowSeconds: 60 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Slow down — too many comments.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const subject = await resolveSubjectByHandle(subjectHandle);
    if (!subject) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // Reply target must exist and belong to the same subject thread.
    let parentAuthorId: string | null = null;
    if (parentId) {
      const parentRows = await sql`
        SELECT id, author_id FROM comments
        WHERE id = ${parentId} AND subject_id = ${subject.id} AND deleted_at IS NULL
        LIMIT 1
      `;
      if (!parentRows.length) return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 });
      parentAuthorId = (parentRows[0] as { author_id: string }).author_id;
    }

    const result = await sql`
      INSERT INTO comments (ride_id, author_id, subject_id, content, parent_id, is_visible, flagged_for_review)
      VALUES (NULL, ${authorId}, ${subject.id}, ${content}, ${parentId}, true, false)
      RETURNING id, created_at
    `;
    const id = (result[0] as { id: string }).id;

    // Notify (in-app + OS push) — best-effort, never blocks the response.
    // sendPushToUser no-ops when the recipient has no push token (e.g. seed users).
    const ah = await sql`
      SELECT COALESCE(dp.handle, rp.handle) AS handle
      FROM users u
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
      WHERE u.id = ${authorId} LIMIT 1
    `;
    const who = (ah[0]?.handle as string | null) ? `@${ah[0].handle}` : 'Someone';
    const preview = content.length > 90 ? `${content.slice(0, 87)}…` : content;

    if (parentId) {
      // Reply → push the person whose comment was replied to (if a different real user).
      if (parentAuthorId && parentAuthorId !== authorId) {
        notifyUserWithPush(parentAuthorId, 'new_comment', { commentId: id, subjectHandle, parentId }, {
          title: `${who} replied to your comment 💬`,
          body: preview,
          data: { type: 'comment_reply', subjectHandle },
        }).catch(() => {});
      }
      // Profile owner still gets the in-app event (no extra push, to avoid noise).
      if (subject.id !== authorId && subject.id !== parentAuthorId) {
        notifyUser(subject.id, 'new_comment', { commentId: id, subjectHandle, parentId }).catch(() => {});
      }
    } else if (subject.id !== authorId) {
      // Top-level comment → push the profile owner: "someone commented on your profile".
      notifyUserWithPush(subject.id, 'new_comment', { commentId: id, subjectHandle }, {
        title: `${who} commented on your profile 💬`,
        body: preview,
        data: { type: 'new_comment', subjectHandle },
      }).catch(() => {});
    }

    return NextResponse.json({ id, created_at: (result[0] as { created_at: string }).created_at }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/comments/profile]', err);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
