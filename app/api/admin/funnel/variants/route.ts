import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

// GET: List variants for a zone + market
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const zoneId = request.nextUrl.searchParams.get('zone_id');
  const marketId = request.nextUrl.searchParams.get('market_id');

  if (!zoneId) {
    return NextResponse.json({ error: 'zone_id required' }, { status: 400 });
  }

  const variants = await sql`
    SELECT cv.*, cz.zone_key, cz.page_slug
    FROM content_variants cv
    JOIN content_zones cz ON cz.id = cv.zone_id
    WHERE cv.zone_id = ${zoneId}
    ${marketId ? sql`AND cv.market_id = ${marketId}` : sql``}
    ORDER BY cv.variant_name ASC
  `;

  return NextResponse.json({ variants });
}

// POST: Create or update a variant (auto-creates version)
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { zone_id, market_id, variant_name, content, seo_keywords, utm_targets, save_status } = body;

  if (!zone_id || !market_id || !content) {
    return NextResponse.json({ error: 'zone_id, market_id, and content required' }, { status: 400 });
  }

  const name = variant_name || 'control';
  const status = save_status === 'pending_approval' ? 'pending_approval' : 'published';
  const isPending = status === 'pending_approval';

  // Upsert variant
  const existing = await sql`
    SELECT id FROM content_variants
    WHERE zone_id = ${zone_id} AND market_id = ${market_id} AND variant_name = ${name}
  `;

  let variantId: string;
  if (existing.length > 0) {
    variantId = existing[0].id as string;
    await sql`
      UPDATE content_variants
      SET content = ${JSON.stringify(content)},
          seo_keywords = ${seo_keywords || null},
          utm_targets = ${utm_targets ? JSON.stringify(utm_targets) : null},
          status = ${status},
          published_at = ${isPending ? null : sql`COALESCE(published_at, NOW())`},
          approval_requested_by = ${isPending ? admin.id : null},
          approval_requested_at = ${isPending ? new Date().toISOString() : null},
          updated_by = ${admin.id},
          updated_at = NOW()
      WHERE id = ${variantId}
    `;
  } else {
    const rows = await sql`
      INSERT INTO content_variants (zone_id, market_id, variant_name, content, seo_keywords, utm_targets, status, published_at, approval_requested_by, approval_requested_at, created_by, updated_by)
      VALUES (${zone_id}, ${market_id}, ${name}, ${JSON.stringify(content)}, ${seo_keywords || null}, ${utm_targets ? JSON.stringify(utm_targets) : null}, ${status}, ${isPending ? null : new Date().toISOString()}, ${isPending ? admin.id : null}, ${isPending ? new Date().toISOString() : null}, ${admin.id}, ${admin.id})
      RETURNING id
    `;
    variantId = rows[0].id as string;
  }

  // Create version
  const versionRows = await sql`
    SELECT COALESCE(MAX(version_number), 0) as max_ver
    FROM content_versions WHERE variant_id = ${variantId}
  `;
  const nextVersion = (versionRows[0].max_ver as number) + 1;

  await sql`
    INSERT INTO content_versions (variant_id, version_number, content, status, change_summary, created_by)
    VALUES (${variantId}, ${nextVersion}, ${JSON.stringify(content)}, 'draft', ${body.change_summary || null}, ${admin.id})
  `;

  await logAdminAction(admin.id, 'cms_variant_saved', 'content_variant', variantId, { variant_name: name, version: nextVersion });

  return NextResponse.json({ variant_id: variantId, version: nextVersion });
}

// PATCH: Publish or archive a variant
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { variant_id, status } = body;

  if (!variant_id || !status) {
    return NextResponse.json({ error: 'variant_id and status required' }, { status: 400 });
  }

  if (!['draft', 'published', 'archived'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  await sql`
    UPDATE content_variants
    SET status = ${status},
        published_at = ${status === 'published' ? new Date().toISOString() : null},
        updated_by = ${admin.id},
        updated_at = NOW()
    WHERE id = ${variant_id}
  `;

  await logAdminAction(admin.id, `cms_variant_${status}`, 'content_variant', variant_id);

  return NextResponse.json({ ok: true });
}
