// GET /api/comments/activity?since=<iso>&limit=30
// Comment activity relevant to the signed-in user, for the in-app "new comment
// on your photo" indicator: (a) comments left ON your profile by others, and
// (b) replies to comments YOU wrote (on any profile). Powers three surfaces:
//   • the PROFILE-tab unread badge (unreadCount)
//   • the Activity inbox list (items)
//   • the live banner + which surfaces are enabled (config)
//
// "Unread" is computed against the `since` timestamp the client stores locally
// (last time it opened the inbox) — so the badge is accurate across app
// restarts without any server-side last-seen column.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { getCommentIndicatorConfig } from '@/lib/comments/indicator-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

interface ActivityRow {
  id: string;
  kind: 'comment_on_profile' | 'reply_to_comment';
  content: string;
  redacted_content: string | null;
  created_at: string;
  author_id: string;
  author_handle: string | null;
  author_name: string | null;
  author_photo: string | null;
  subject_handle: string | null;
  subject_id: string;
}

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const meRows = await sql`
    SELECT u.id, COALESCE(dp.handle, rp.handle) AS handle
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    WHERE u.clerk_id = ${clerkId} LIMIT 1
  `;
  if (!meRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const meId = (meRows[0] as { id: string }).id;
  const meHandle = (meRows[0] as { handle: string | null }).handle;
  // Handle-less subjects (riders without a handle) are addressed by id; the
  // comments read/write routes accept a UUID in place of a handle.
  const selfHandle = meHandle ?? meId;

  const sinceParam = req.nextUrl.searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : new Date(0);
  const sinceIso = isNaN(since.getTime()) ? new Date(0).toISOString() : since.toISOString();

  const limitParam = Number(req.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, limitParam));

  // Author identity + the handle of the profile the thread lives on, resolved
  // the same way as the comment tree (seed comments carry their own identity).
  // subject_handle falls back to the subject's id so handle-less rider threads
  // are still openable.
  const rows = (await sql`
    SELECT
      c.id,
      CASE WHEN c.subject_id = ${meId} THEN 'comment_on_profile' ELSE 'reply_to_comment' END AS kind,
      c.content, c.redacted_content, c.created_at, c.subject_id,
      u.id AS author_id,
      COALESCE(c.seed_author_handle, dp.handle, rp.handle) AS author_handle,
      COALESCE(c.seed_author_name, dp.display_name, rp.display_name) AS author_name,
      COALESCE(c.seed_author_avatar_url, dp.thumbnail_url, rp.thumbnail_url, rp.avatar_url, dp.vehicle_info->>'photo_url') AS author_photo,
      COALESCE(sdp.handle, srp.handle, c.subject_id::text) AS subject_handle
    FROM comments c
    JOIN users u ON u.id = c.author_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    LEFT JOIN driver_profiles sdp ON sdp.user_id = c.subject_id
    LEFT JOIN rider_profiles  srp ON srp.user_id = c.subject_id
    WHERE c.deleted_at IS NULL
      AND c.is_visible = true
      AND c.author_id <> ${meId}
      AND (
        c.subject_id = ${meId}
        OR c.parent_id IN (SELECT id FROM comments WHERE author_id = ${meId} AND deleted_at IS NULL)
      )
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `) as unknown as ActivityRow[];

  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    authorHandle: r.author_handle,
    authorName: r.author_name,
    authorPhoto: r.author_photo,
    // Prefer the moderated/redacted text if present.
    preview: r.redacted_content ?? r.content,
    createdAt: r.created_at,
    subjectHandle: r.subject_handle,
    unread: new Date(r.created_at).getTime() > new Date(sinceIso).getTime(),
  }));

  const unreadCount = items.filter((i) => i.unread).length;
  const config = await getCommentIndicatorConfig();

  return NextResponse.json({ unreadCount, items, config, selfHandle });
}
