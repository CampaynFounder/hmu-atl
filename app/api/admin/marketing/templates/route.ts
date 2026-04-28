// GET /api/admin/marketing/templates — list active templates
// POST /api/admin/marketing/templates — create a new template
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT id, label, body, updated_at
    FROM marketing_templates
    WHERE archived_at IS NULL
    ORDER BY updated_at DESC
  `;

  return NextResponse.json({ templates: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

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
    INSERT INTO marketing_templates (label, body, created_by)
    VALUES (${trimmedLabel}, ${trimmedBody}, ${admin.id})
    RETURNING id, label, body, updated_at
  `;

  await logAdminAction(admin.id, 'marketing_template_created', 'marketing_template', rows[0].id as string, {
    label: trimmedLabel,
    bodyPreview: trimmedBody.slice(0, 80),
  });

  return NextResponse.json({ template: rows[0] }, { status: 201 });
}
