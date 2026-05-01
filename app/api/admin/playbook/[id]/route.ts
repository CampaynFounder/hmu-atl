// Response Playbook — update + archive a single entry. Super-only.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import {
  getPlaybook,
  updatePlaybook,
  archivePlaybook,
  type PlaybookAudience,
} from '@/lib/admin/playbook';

const AUDIENCES: PlaybookAudience[] = ['driver', 'rider', 'any'];

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const { id } = await ctx.params;
  const existing = await getPlaybook(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json()) as {
    title?: string;
    question_text?: string;
    answer_body?: string;
    audience?: string;
    priority?: number;
    is_active?: boolean;
  };

  const audience =
    body.audience && (AUDIENCES as string[]).includes(body.audience)
      ? (body.audience as PlaybookAudience)
      : undefined;

  const updated = await updatePlaybook(id, {
    title: body.title?.trim(),
    question_text: body.question_text?.trim(),
    answer_body: body.answer_body?.trim(),
    audience,
    priority: typeof body.priority === 'number' ? body.priority : undefined,
    is_active: typeof body.is_active === 'boolean' ? body.is_active : undefined,
  });

  await logAdminAction(admin.id, 'playbook_update', 'response_playbook', id, {
    fields: Object.keys(body),
  });

  return NextResponse.json({ entry: updated });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const { id } = await ctx.params;
  const existing = await getPlaybook(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Archive (set inactive) rather than hard-delete — preserves audit FK on
  // response_playbook_sends and lets supers undo via the Inactive filter.
  await archivePlaybook(id);
  await logAdminAction(admin.id, 'playbook_archive', 'response_playbook', id, {
    title: existing.title,
  });

  return NextResponse.json({ ok: true });
}
