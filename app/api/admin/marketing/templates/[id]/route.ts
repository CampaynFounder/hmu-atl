// PATCH /api/admin/marketing/templates/[id] — update label/body/link
// DELETE /api/admin/marketing/templates/[id] — soft-delete (archive)
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const MAX_LINK_LEN = 500;

// Same shape as the create route's helper. `undefined` = field not provided
// (don't touch column), `null` = clear column, string = new value.
function normalizeLink(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_LINK_LEN) return undefined;
  return trimmed;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const { label, body, link } = await req.json() as { label?: string; body?: string; link?: string | null };
  const trimmedLabel = label?.trim();
  const trimmedBody = body?.trim();
  const normalizedLink = normalizeLink(link);

  if (!trimmedLabel || !trimmedBody) {
    return NextResponse.json({ error: 'label and body are required' }, { status: 400 });
  }
  if (trimmedLabel.length > 80) {
    return NextResponse.json({ error: 'label too long (max 80)' }, { status: 400 });
  }
  if (trimmedBody.length > 160) {
    return NextResponse.json({ error: 'body too long (max 160)' }, { status: 400 });
  }
  if (normalizedLink === undefined && link !== undefined && link !== null && link !== '') {
    return NextResponse.json({ error: `link too long (max ${MAX_LINK_LEN})` }, { status: 400 });
  }

  // Treat both `undefined` (field absent in payload) and `null` (explicit clear)
  // as "set link = NULL" — the client always sends the current link value, so
  // the only way to keep an existing value is to send the same string.
  const linkValue = normalizedLink ?? null;

  const rows = await sql`
    UPDATE marketing_templates
    SET label = ${trimmedLabel},
        body = ${trimmedBody},
        link = ${linkValue},
        updated_at = NOW()
    WHERE id = ${id} AND archived_at IS NULL
    RETURNING id, label, body, link, updated_at
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  await logAdminAction(admin.id, 'marketing_template_updated', 'marketing_template', id, {
    label: trimmedLabel,
    bodyPreview: trimmedBody.slice(0, 80),
    hasLink: !!linkValue,
  });

  return NextResponse.json({ template: rows[0] });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const rows = await sql`
    UPDATE marketing_templates
    SET archived_at = NOW()
    WHERE id = ${id} AND archived_at IS NULL
    RETURNING id, label
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  await logAdminAction(admin.id, 'marketing_template_deleted', 'marketing_template', id, {
    label: rows[0].label,
  });

  return NextResponse.json({ ok: true });
}
