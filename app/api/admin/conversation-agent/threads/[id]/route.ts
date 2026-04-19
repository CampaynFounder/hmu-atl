import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { getThread, listMessages } from '@/lib/conversation/threads';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  const { id } = await params;
  const thread = await getThread(id);
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const messages = await listMessages(id);
  return NextResponse.json({ thread, messages });
}
