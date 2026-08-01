// Shared helpers for profile-scoped comments (comments about a driver/rider
// profile, not tied to a ride). The `comments` table already supports this:
// subject_id = the profile owner, ride_id = NULL, parent_id = nesting.

import { sql } from '@/lib/db/client';

export interface SubjectRef {
  id: string;
  profile_type: string;
}

/** Resolve a public @handle (driver or rider) to its owning user. */
export async function resolveSubjectByHandle(handle: string): Promise<SubjectRef | null> {
  const rows = await sql`
    SELECT u.id, u.profile_type
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id AND dp.handle = ${handle}
    WHERE u.account_status <> 'deleted'
    LIMIT 1
  `;
  if (rows.length) return rows[0] as SubjectRef;

  const riderRows = await sql`
    SELECT u.id, u.profile_type
    FROM users u
    JOIN rider_profiles rp ON rp.user_id = u.id AND rp.handle = ${handle}
    WHERE u.account_status <> 'deleted'
    LIMIT 1
  `;
  return (riderRows[0] as SubjectRef) || null;
}

export interface CommentNode {
  id: string;
  parent_id: string | null;
  content: string;
  redacted_content: string | null;
  author_id: string;
  author_handle: string | null;
  author_name: string | null;
  author_photo: string | null;
  created_at: string;
  edited_at: string | null;
  mine: boolean;
  reactions: { reaction: string; count: number }[] | null;
  my_reaction: string | null;
  replies: CommentNode[];
}

/**
 * Fetch the full nested comment tree for a subject in one query and assemble
 * it in JS. Supports arbitrary depth (the read is flat; nesting is rebuilt
 * from parent_id). Deleted + hidden rows are excluded.
 */
export async function fetchCommentTree(
  subjectId: string,
  viewerUserId: string | null,
): Promise<CommentNode[]> {
  const rows = (await sql`
    SELECT
      c.id, c.parent_id, c.content, c.redacted_content, c.created_at, c.edited_at,
      u.id AS author_id,
      -- Seed comments carry their own display identity (seed_author_*); fall back
      -- to the real author's profile for normal comments.
      COALESCE(c.seed_author_handle, dp.handle, rp.handle) AS author_handle,
      COALESCE(c.seed_author_name, dp.display_name, rp.display_name) AS author_name,
      COALESCE(c.seed_author_avatar_url, dp.thumbnail_url, rp.thumbnail_url, rp.avatar_url, dp.vehicle_info->>'photo_url') AS author_photo,
      (
        SELECT json_agg(json_build_object('reaction', cr.reaction, 'count', cr.cnt))
        FROM (
          SELECT reaction, COUNT(*)::int AS cnt
          FROM comment_reactions WHERE comment_id = c.id GROUP BY reaction
        ) cr
      ) AS reactions,
      ${viewerUserId ? sql`(
        SELECT reaction FROM comment_reactions
        WHERE comment_id = c.id AND user_id = ${viewerUserId} LIMIT 1
      )` : sql`NULL`} AS my_reaction
    FROM comments c
    JOIN users u ON u.id = c.author_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE c.subject_id = ${subjectId}
      AND c.is_visible = true
      AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT 500
  `) as Record<string, unknown>[];

  const byId = new Map<string, CommentNode>();
  const roots: CommentNode[] = [];

  for (const r of rows) {
    const node: CommentNode = {
      id: r.id as string,
      parent_id: (r.parent_id as string | null) ?? null,
      content: r.content as string,
      redacted_content: (r.redacted_content as string | null) ?? null,
      author_id: r.author_id as string,
      author_handle: (r.author_handle as string | null) ?? null,
      author_name: (r.author_name as string | null) ?? null,
      author_photo: (r.author_photo as string | null) ?? null,
      created_at: r.created_at as string,
      edited_at: (r.edited_at as string | null) ?? null,
      mine: !!viewerUserId && r.author_id === viewerUserId,
      reactions: (r.reactions as { reaction: string; count: number }[] | null) ?? null,
      my_reaction: (r.my_reaction as string | null) ?? null,
      replies: [],
    };
    byId.set(node.id, node);
  }

  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
