// GET  /api/admin/seed-users/[id]/comments  — list seed comments on a seed user
// POST /api/admin/seed-users/[id]/comments  — add a seed comment (custom name/avatar)
// Super-admin only. Only seed subjects may receive seed comments.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { isSeedUser, createSeedComment, listSeedComments } from '@/lib/db/seed-comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const { id } = await params;
  const comments = await listSeedComments(id);
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();
  const { id } = await params;

  if (!(await isSeedUser(id))) {
    return NextResponse.json({ error: 'Comments can only be added to seed users' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const authorName = typeof body.authorName === 'string' ? body.authorName.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!authorName) return NextResponse.json({ error: 'authorName is required' }, { status: 400 });
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 });
  if (content.length > 500) return NextResponse.json({ error: 'content must be ≤ 500 characters' }, { status: 400 });

  const comment = await createSeedComment({
    subjectUserId: id,
    authorName,
    authorHandle: typeof body.authorHandle === 'string' && body.authorHandle.trim() ? body.authorHandle.trim().replace(/^@+/, '') : null,
    avatarUrl: typeof body.avatarUrl === 'string' && body.avatarUrl ? body.avatarUrl : null,
    content,
  });

  await logAdminAction(admin.id, 'seed_comment.create', 'user', id, { commentId: comment.id, authorName });
  return NextResponse.json({ comment }, { status: 201 });
}
