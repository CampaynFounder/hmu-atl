// GET /api/admin/marketing/templates — list active templates
// POST /api/admin/marketing/templates — create a new template
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const MAX_LINK_LEN = 500;

// Normalize an admin-supplied link: trim, treat empty as null, cap length.
// Stored as plain text — outreach links are already UTM-built upstream and
// pasted as full URLs. No URL validation here so future schemes (sms:, tel:,
// app deep links) work without API changes.
function normalizeLink(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined; // not provided → leave alone
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_LINK_LEN) return undefined;
  return trimmed;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const rows = await sql`
    SELECT id, label, body, link, updated_at
    FROM marketing_templates
    WHERE archived_at IS NULL
    ORDER BY updated_at DESC
  `;

  return NextResponse.json({ templates: rows });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { label, body, link } = await req.json() as { label?: string; body?: string; link?: string };
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

  // normalizedLink is `undefined` when nothing was sent and `null` when sent
  // empty/blank — we want both to write NULL into the column on create.
  const linkValue = normalizedLink ?? null;

  const rows = await sql`
    INSERT INTO marketing_templates (label, body, link, created_by)
    VALUES (${trimmedLabel}, ${trimmedBody}, ${linkValue}, ${admin.id})
    RETURNING id, label, body, link, updated_at
  `;

  await logAdminAction(admin.id, 'marketing_template_created', 'marketing_template', rows[0].id as string, {
    label: trimmedLabel,
    bodyPreview: trimmedBody.slice(0, 80),
    hasLink: !!linkValue,
  });

  return NextResponse.json({ template: rows[0] }, { status: 201 });
}
