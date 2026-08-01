// PATCH  /api/comments/[id] — edit your own comment
// DELETE /api/comments/[id] — delete your own comment (soft-delete the subtree)
//
// Author-only. Delete cascades to nested replies via a recursive CTE so a
// removed parent never leaves orphaned replies visible.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_MAX_CHARS = 300;

async function getMaxChars(): Promise<number> {
  const rows = await sql`SELECT config_value FROM platform_config WHERE config_key = 'comments.settings' LIMIT 1`;
  const v = (rows[0]?.config_value as Record<string, number> | undefined) ?? {};
  return v.maxChars ?? DEFAULT_MAX_CHARS;
}

async function resolveAuthor(clerkId: string): Promise<string | null> {
  const rows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  return rows.length ? (rows[0] as { id: string }).id : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { content?: string };
  const content = (body.content ?? '').trim();

  const maxChars = await getMaxChars();
  if (!content || content.length > maxChars) {
    return NextResponse.json({ error: `Content must be 1–${maxChars} characters` }, { status: 400 });
  }

  const userId = await resolveAuthor(clerkId);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const rows = await sql`
    UPDATE comments
    SET content = ${content}, edited_at = NOW()
    WHERE id = ${id} AND author_id = ${userId} AND deleted_at IS NULL
    RETURNING id, edited_at
  `;
  if (!rows.length) return NextResponse.json({ error: 'Comment not found or not yours' }, { status: 404 });

  return NextResponse.json({ id, edited_at: (rows[0] as { edited_at: string }).edited_at });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const userId = await resolveAuthor(clerkId);
  if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Only the author may delete, and only their own top comment — but the
  // subtree (replies by anyone) is soft-deleted along with it.
  const ownRows = await sql`
    SELECT id FROM comments WHERE id = ${id} AND author_id = ${userId} AND deleted_at IS NULL LIMIT 1
  `;
  if (!ownRows.length) return NextResponse.json({ error: 'Comment not found or not yours' }, { status: 404 });

  await sql`
    WITH RECURSIVE subtree AS (
      SELECT id FROM comments WHERE id = ${id}
      UNION ALL
      SELECT c.id FROM comments c JOIN subtree s ON c.parent_id = s.id
    )
    UPDATE comments SET deleted_at = NOW(), is_visible = false
    WHERE id IN (SELECT id FROM subtree) AND deleted_at IS NULL
  `;

  return NextResponse.json({ ok: true });
}
