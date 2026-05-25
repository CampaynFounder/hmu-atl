// PATCH /api/admin/comments/[id]
// Admin moderation: hide, unhide, redact content, annotate.
// action: 'hide' | 'unhide' | 'redact' | 'annotate' | 'flag' | 'unflag'

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminRows = await sql`SELECT id, profile_type FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!adminRows.length || (adminRows[0] as { profile_type: string }).profile_type !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const adminId = (adminRows[0] as { id: string }).id;

  const { id: commentId } = await params;
  const body = await req.json();
  const action: string = body.action;

  switch (action) {
    case 'hide':
      await sql`UPDATE comments SET is_visible = false WHERE id = ${commentId}`;
      break;
    case 'unhide':
      await sql`UPDATE comments SET is_visible = true WHERE id = ${commentId}`;
      break;
    case 'redact': {
      const redactedText: string = (body.redactedContent ?? '').trim();
      const note: string = (body.adminNote ?? '').trim();
      if (!redactedText) return NextResponse.json({ error: 'redactedContent required' }, { status: 400 });
      await sql`
        UPDATE comments
        SET redacted_content = ${redactedText},
            admin_note = ${note || null},
            redacted_by = ${adminId},
            redacted_at = NOW()
        WHERE id = ${commentId}
      `;
      break;
    }
    case 'annotate': {
      const note: string = (body.adminNote ?? '').trim();
      await sql`UPDATE comments SET admin_note = ${note || null} WHERE id = ${commentId}`;
      break;
    }
    case 'flag':
      await sql`UPDATE comments SET flagged_for_review = true WHERE id = ${commentId}`;
      break;
    case 'unflag':
      await sql`UPDATE comments SET flagged_for_review = false WHERE id = ${commentId}`;
      break;
    case 'delete':
      await sql`UPDATE comments SET deleted_at = NOW() WHERE id = ${commentId}`;
      break;
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
