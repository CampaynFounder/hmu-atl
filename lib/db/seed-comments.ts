// Seed comments — admin-fabricated comments attached to a seed user's profile.
//
// A seed comment is a normal `comments` row carrying its own display identity
// (seed_author_*) so it needs no fake author user. author_id = subject_id (the
// seed user), which satisfies the NOT NULL FK and makes the comment cascade-
// delete when the seed user is deleted. Only seed subjects may receive them.

import { sql } from './client';

export interface SeedComment {
  id: string;
  content: string;
  seed_author_name: string | null;
  seed_author_handle: string | null;
  seed_author_avatar_url: string | null;
  created_at: string;
}

export interface CreateSeedCommentParams {
  subjectUserId: string;
  authorName: string;
  authorHandle?: string | null;
  avatarUrl?: string | null;
  content: string;
}

/** True if the given user is a seed user (guards against fabricating comments on real people). */
export async function isSeedUser(userId: string): Promise<boolean> {
  const rows = await sql`SELECT is_seed FROM users WHERE id = ${userId} LIMIT 1`;
  return rows.length > 0 && (rows[0] as { is_seed: boolean }).is_seed === true;
}

export async function createSeedComment(params: CreateSeedCommentParams): Promise<SeedComment> {
  const rows = await sql`
    INSERT INTO comments (
      ride_id, author_id, subject_id, content, parent_id,
      is_visible, flagged_for_review,
      is_seed, seed_author_name, seed_author_handle, seed_author_avatar_url
    ) VALUES (
      NULL, ${params.subjectUserId}, ${params.subjectUserId}, ${params.content}, NULL,
      true, false,
      true, ${params.authorName}, ${params.authorHandle ?? null}, ${params.avatarUrl ?? null}
    )
    RETURNING id, content, seed_author_name, seed_author_handle, seed_author_avatar_url, created_at
  `;
  return rows[0] as SeedComment;
}

export async function listSeedComments(subjectUserId: string): Promise<SeedComment[]> {
  const rows = await sql`
    SELECT id, content, seed_author_name, seed_author_handle, seed_author_avatar_url, created_at
    FROM comments
    WHERE subject_id = ${subjectUserId} AND is_seed = true AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;
  return rows as SeedComment[];
}

/** Delete one seed comment (guarded by is_seed). Returns its avatar URL for R2 cleanup, or null. */
export async function deleteSeedComment(commentId: string): Promise<{ avatar_url: string | null } | null> {
  const rows = await sql`
    DELETE FROM comments WHERE id = ${commentId} AND is_seed = true
    RETURNING seed_author_avatar_url AS avatar_url
  `;
  return (rows[0] as { avatar_url: string | null }) || null;
}
