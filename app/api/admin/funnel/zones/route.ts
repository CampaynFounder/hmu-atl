import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { ZONE_REGISTRY } from '@/lib/cms/zone-registry';

// GET: List zones for a page, with their published variant content
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const pageSlug = request.nextUrl.searchParams.get('page');
  const marketId = request.nextUrl.searchParams.get('market_id');
  const stage = request.nextUrl.searchParams.get('stage') || 'awareness';
  const stageVariantName = stage === 'awareness' ? 'control' : `stage_${stage}`;

  let zones;
  if (pageSlug) {
    // Load stage-specific variant if it exists, otherwise fall back to control
    zones = await sql`
      SELECT
        cz.*,
        COALESCE(sv.id, cv.id) as variant_id,
        COALESCE(sv.variant_name, cv.variant_name) as variant_name,
        COALESCE(sv.content, cv.content) as variant_content,
        COALESCE(sv.status, cv.status) as variant_status,
        COALESCE(sv.updated_at, cv.updated_at) as variant_updated_at,
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END as has_stage_override
      FROM content_zones cz
      LEFT JOIN content_variants cv ON cv.zone_id = cz.id
        AND cv.variant_name = 'control'
        ${marketId ? sql`AND cv.market_id = ${marketId}` : sql``}
      LEFT JOIN content_variants sv ON sv.zone_id = cz.id
        AND sv.variant_name = ${stageVariantName}
        ${marketId ? sql`AND sv.market_id = ${marketId}` : sql``}
      WHERE cz.page_slug = ${pageSlug}
      ORDER BY cz.sort_order ASC
    `;
  } else {
    zones = await sql`
      SELECT cz.*, COUNT(cv.id) as variant_count,
        MAX(cv.updated_at) as last_updated
      FROM content_zones cz
      LEFT JOIN content_variants cv ON cv.zone_id = cz.id
      GROUP BY cz.id
      ORDER BY cz.page_slug, cz.sort_order ASC
    `;
  }

  return NextResponse.json({ zones });
}

// POST: Seed zones from the registry
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  let seeded = 0;
  for (const entry of ZONE_REGISTRY) {
    const existing = await sql`
      SELECT id FROM content_zones
      WHERE page_slug = ${entry.pageSlug} AND zone_key = ${entry.zoneKey}
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO content_zones (page_slug, zone_key, audience, funnel_stage, zone_type, constraints, display_name, description, sort_order)
        VALUES (
          ${entry.pageSlug}, ${entry.zoneKey}, ${entry.audience}, ${entry.funnelStage},
          ${entry.zoneType}, ${JSON.stringify(entry.constraints)}, ${entry.displayName},
          ${entry.description}, ${entry.sortOrder}
        )
      `;
      seeded++;
    }
  }

  await logAdminAction(admin.id, 'cms_zones_seeded', 'cms', undefined, { seeded, total: ZONE_REGISTRY.length });

  return NextResponse.json({ seeded, total: ZONE_REGISTRY.length });
}
