// GET /api/comments/user/[handle]
// Returns visible top-level comments about a user, with replies + reaction counts.
// Public for drivers (shown on browse/booking), auth required for riders (shown to drivers accepting).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const { userId: clerkId } = await auth();

  const subjectRows = await sql`
    SELECT u.id, u.profile_type
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id AND dp.handle = ${handle}
    WHERE u.account_status <> 'deleted'
    LIMIT 1
  `;

  // Fallback: maybe subject is a rider (handle stored on rider_profiles)
  let subjectId: string | null = null;
  let subjectType: string | null = null;
  if (subjectRows.length) {
    subjectId = (subjectRows[0] as { id: string }).id;
    subjectType = (subjectRows[0] as { profile_type: string }).profile_type;
  } else {
    const riderRows = await sql`
      SELECT u.id, u.profile_type
      FROM users u
      JOIN rider_profiles rp ON rp.user_id = u.id AND rp.handle = ${handle}
      WHERE u.account_status <> 'deleted'
      LIMIT 1
    `;
    if (riderRows.length) {
      subjectId = (riderRows[0] as { id: string }).id;
      subjectType = (riderRows[0] as { profile_type: string }).profile_type;
    }
  }

  if (!subjectId) return NextResponse.json({ comments: [] });

  // Riders are private — only authenticated drivers who've ridden with them can view
  if (subjectType === 'rider') {
    if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const viewerRows = await sql`
      SELECT u.id, u.profile_type FROM users u WHERE clerk_id = ${clerkId} LIMIT 1
    `;
    if (!viewerRows.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const viewer = viewerRows[0] as { id: string; profile_type: string };
    if (viewer.profile_type !== 'driver' && viewer.profile_type !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Viewer's own user id for reaction lookup
  let viewerUserId: string | null = null;
  if (clerkId) {
    const vRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    if (vRows.length) viewerUserId = (vRows[0] as { id: string }).id;
  }

  // Fetch top-level comments (parent_id IS NULL)
  const comments = await sql`
    SELECT
      c.id,
      c.content,
      c.redacted_content,
      c.admin_note,
      c.created_at,
      c.ride_id,
      u.id AS author_id,
      COALESCE(dp.handle, rp.handle) AS author_handle,
      COALESCE(dp.display_name, rp.display_name) AS author_name,
      dp.vehicle_info->>'photo_url' AS author_photo,
      (
        SELECT json_agg(json_build_object(
          'reaction', cr.reaction,
          'count', cr.cnt
        ))
        FROM (
          SELECT reaction, COUNT(*)::int AS cnt
          FROM comment_reactions
          WHERE comment_id = c.id
          GROUP BY reaction
        ) cr
      ) AS reactions,
      ${viewerUserId ? sql`(
        SELECT reaction FROM comment_reactions
        WHERE comment_id = c.id AND user_id = ${viewerUserId}
        LIMIT 1
      )` : sql`NULL`} AS my_reaction
    FROM comments c
    JOIN users u ON u.id = c.author_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE c.subject_id = ${subjectId}
      AND c.parent_id IS NULL
      AND c.is_visible = true
    ORDER BY c.created_at DESC
    LIMIT 50
  `;

  // Fetch all replies for these comments in one query
  const commentIds = (comments as { id: string }[]).map(c => c.id);
  let replies: Record<string, unknown>[] = [];
  if (commentIds.length > 0) {
    replies = await sql`
      SELECT
        r.id,
        r.parent_id,
        r.content,
        r.redacted_content,
        r.created_at,
        u.id AS author_id,
        COALESCE(dp.handle, rp.handle) AS author_handle,
        COALESCE(dp.display_name, rp.display_name) AS author_name,
        dp.vehicle_info->>'photo_url' AS author_photo,
        (
          SELECT json_agg(json_build_object('reaction', cr.reaction, 'count', cr.cnt))
          FROM (
            SELECT reaction, COUNT(*)::int AS cnt
            FROM comment_reactions
            WHERE comment_id = r.id
            GROUP BY reaction
          ) cr
        ) AS reactions,
        ${viewerUserId ? sql`(
          SELECT reaction FROM comment_reactions
          WHERE comment_id = r.id AND user_id = ${viewerUserId}
          LIMIT 1
        )` : sql`NULL`} AS my_reaction
      FROM comments r
      JOIN users u ON u.id = r.author_id
      LEFT JOIN driver_profiles dp ON dp.user_id = u.id
      LEFT JOIN rider_profiles rp ON rp.user_id = u.id
      WHERE r.parent_id = ANY(${commentIds}::uuid[])
        AND r.is_visible = true
      ORDER BY r.created_at ASC
    ` as Record<string, unknown>[];
  }

  // Group replies by parent_id
  const repliesByParent: Record<string, unknown[]> = {};
  for (const r of replies) {
    const pid = r.parent_id as string;
    if (!repliesByParent[pid]) repliesByParent[pid] = [];
    repliesByParent[pid].push(r);
  }

  const result = (comments as Record<string, unknown>[]).map(c => ({
    ...c,
    replies: repliesByParent[c.id as string] ?? [],
  }));

  return NextResponse.json({ comments: result });
}
