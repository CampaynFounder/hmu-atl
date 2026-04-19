// CSV transcript export for compliance review + offline audit.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';
import { getThread, listMessages } from '@/lib/conversation/threads';

function csvEscape(v: string | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const thread = await getThread(id);
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const messages = await listMessages(id, 500);

  const header = ['sent_at', 'direction', 'generated_by', 'delivery_status', 'body', 'voipms_id', 'error'];
  const lines = [header.join(',')];
  for (const m of messages) {
    lines.push([
      new Date(m.sent_at).toISOString(),
      m.direction,
      m.generated_by ?? '',
      m.delivery_status ?? '',
      csvEscape(m.body),
      m.voipms_id ?? '',
      csvEscape(m.error_message),
    ].join(','));
  }

  const csv = lines.join('\n') + '\n';
  const fileName = `conversation-${id}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fileName}"`,
    },
  });
}
