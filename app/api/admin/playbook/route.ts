// Response Playbook — list + create.
// Super admins create/manage entries here; admins consume via the picker
// inside /admin/messages.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import {
  listPlaybook,
  listPlaybookForAudience,
  createPlaybook,
  type PlaybookAudience,
} from '@/lib/admin/playbook';

const AUDIENCES: PlaybookAudience[] = ['driver', 'rider', 'any'];

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { searchParams } = req.nextUrl;
  const mode = searchParams.get('mode'); // 'picker' | null

  // Picker mode is what /admin/messages calls — filtered to active + audience.
  // 'all' is allowed (and the picker's default for unknown-profile recipients);
  // any other value is coerced to 'all' rather than 'any' so a typo can't
  // silently hide entries that aren't tagged 'any'.
  // No super check; any admin who can view messages can fetch suggestions.
  if (mode === 'picker') {
    const audParam = searchParams.get('audience');
    const aud: PlaybookAudience | 'all' =
      audParam && (AUDIENCES as string[]).includes(audParam)
        ? (audParam as PlaybookAudience)
        : 'all';
    const entries = await listPlaybookForAudience(aud);
    return NextResponse.json({ entries });
  }

  // Full-list management mode is super-only.
  if (!admin.is_super) return unauthorizedResponse();

  const audParam = searchParams.get('audience');
  const statusParam = searchParams.get('status');
  const search = searchParams.get('q') ?? '';
  const audience =
    audParam && (AUDIENCES as string[]).includes(audParam)
      ? (audParam as PlaybookAudience)
      : 'all';
  const status =
    statusParam === 'active' || statusParam === 'inactive' ? statusParam : 'all';

  const entries = await listPlaybook({ audience, status, search });
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) return unauthorizedResponse();

  const body = (await req.json()) as {
    title?: string;
    question_text?: string;
    answer_body?: string;
    audience?: string;
    priority?: number;
    is_active?: boolean;
  };

  const title = body.title?.trim() ?? '';
  const question = body.question_text?.trim() ?? '';
  const answer = body.answer_body?.trim() ?? '';
  if (!title || !question || !answer) {
    return NextResponse.json(
      { error: 'title, question_text, and answer_body are required' },
      { status: 400 },
    );
  }
  const audience: PlaybookAudience = (AUDIENCES as string[]).includes(body.audience ?? '')
    ? (body.audience as PlaybookAudience)
    : 'any';

  const entry = await createPlaybook({
    title,
    question_text: question,
    answer_body: answer,
    audience,
    priority: typeof body.priority === 'number' ? body.priority : 0,
    is_active: body.is_active ?? true,
    created_by: admin.id,
  });

  await logAdminAction(admin.id, 'playbook_create', 'response_playbook', entry.id, {
    title,
    audience,
    answer_chars: answer.length,
  });

  return NextResponse.json({ entry });
}
