import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

// GET: Get section layout for a page + stage + market
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const pageSlug = request.nextUrl.searchParams.get('page_slug');
  const stage = request.nextUrl.searchParams.get('stage');
  const marketId = request.nextUrl.searchParams.get('market_id');

  if (!pageSlug || !stage || !marketId) {
    return NextResponse.json({ error: 'page_slug, stage, and market_id required' }, { status: 400 });
  }

  const rows = await sql`
    SELECT * FROM page_section_layouts
    WHERE page_slug = ${pageSlug}
      AND funnel_stage_slug = ${stage}
      AND market_id = ${marketId}
    LIMIT 1
  `;

  return NextResponse.json({ layout: rows[0] || null });
}

// PUT: Save section layout (upsert)
export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { page_slug, stage, market_id, sections } = body;

  if (!page_slug || !stage || !market_id || !Array.isArray(sections)) {
    return NextResponse.json({ error: 'page_slug, stage, market_id, and sections array required' }, { status: 400 });
  }

  const existing = await sql`
    SELECT id FROM page_section_layouts
    WHERE page_slug = ${page_slug}
      AND funnel_stage_slug = ${stage}
      AND market_id = ${market_id}
  `;

  if (existing.length > 0) {
    await sql`
      UPDATE page_section_layouts
      SET sections = ${JSON.stringify(sections)},
          updated_by = ${admin.id},
          updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
  } else {
    await sql`
      INSERT INTO page_section_layouts (page_slug, funnel_stage_slug, market_id, sections, created_by, updated_by)
      VALUES (${page_slug}, ${stage}, ${market_id}, ${JSON.stringify(sections)}, ${admin.id}, ${admin.id})
    `;
  }

  await logAdminAction(admin.id, 'funnel_layout_saved', 'page_section_layout', page_slug, { stage, section_count: sections.length });

  return NextResponse.json({ ok: true });
}
