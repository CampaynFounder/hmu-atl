// GET /api/admin/comments — list flagged/all comments for moderation
// PATCH /api/admin/comments/[id] is the individual moderation action

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertAdmin(clerkId: string) {
  const rows = await sql`SELECT profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!rows.length || (rows[0] as { profile_type: string }).profile_type !== 'admin') {
    throw new Error('Admin only');
  }
}

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { await assertAdmin(clerkId); } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }); }

  const flaggedOnly = req.nextUrl.searchParams.get('flagged') === '1';
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0));

  const comments = await sql`
    SELECT
      c.id,
      c.content,
      c.redacted_content,
      c.admin_note,
      c.is_visible,
      c.flagged_for_review,
      c.parent_id,
      c.created_at,
      c.redacted_at,
      a.id AS author_id,
      adp.handle AS author_handle,
      adp.display_name AS author_name,
      s.id AS subject_id,
      sdp.handle AS subject_handle,
      sdp.display_name AS subject_name
    FROM comments c
    JOIN users a ON a.id = c.author_id
    LEFT JOIN driver_profiles adp ON adp.user_id = a.id
    JOIN users s ON s.id = c.subject_id
    LEFT JOIN driver_profiles sdp ON sdp.user_id = s.id
    WHERE (NOT ${flaggedOnly}::boolean OR c.flagged_for_review = true)
      AND c.deleted_at IS NULL
    ORDER BY c.flagged_for_review DESC, c.created_at DESC
    LIMIT 50 OFFSET ${offset}
  `;

  return NextResponse.json({ comments });
}
