// PATCH /api/admin/marketing/templates/[id] — update label/body
// DELETE /api/admin/marketing/templates/[id] — soft-delete (archive)
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await params;
  const { label, body } = await req.json() as { label?: string; body?: string };
  const trimmedLabel = label?.trim();
  const trimmedBody = body?.trim();

  if (!trimmedLabel || !trimmedBody) {
    return NextResponse.json({ error: 'label and body are required' }, { status: 400 });
  }
  if (trimmedLabel.length > 80) {
    return NextResponse.json({ error: 'label too long (max 80)' }, { status: 400 });
  }
  if (trimmedBody.length > 160) {
    return NextResponse.json({ error: 'body too long (max 160)' }, { status: 400 });
  }

  const rows = await sql`
    UPDATE marketing_templates
    SET label = ${trimmedLabel}, body = ${trimmedBody}, updated_at = NOW()
    WHERE id = ${id} AND archived_at IS NULL
    RETURNING id, label, body, updated_at
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  await logAdminAction(admin.id, 'marketing_template_updated', 'marketing_template', id, {
    label: trimmedLabel,
    bodyPreview: trimmedBody.slice(0, 80),
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
