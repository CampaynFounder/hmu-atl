import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { ZONE_REGISTRY } from '@/lib/cms/zone-registry';

export const dynamic = 'force-dynamic';

// Compute the exact variant name for a given (stage, persona) combo.
// Mirrors the logic in the admin save flow so GET/POST always agree.
function targetVariantFor(stage: string, persona: string | null): string {
  if (persona && stage !== 'awareness') return `persona_${persona}_stage_${stage}`;
  if (persona) return `persona_${persona}`;
  if (stage !== 'awareness') return `stage_${stage}`;
  return 'control';
}

// GET: List zones for a page with the variant that should be shown for the
// current (stage, persona) view. Falls back through
//   target (most specific) → persona → stage → control
// so an admin editing persona B never accidentally sees persona A's content.
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    const pageSlug = request.nextUrl.searchParams.get('page');
    const marketId = request.nextUrl.searchParams.get('market_id');
    const stage = request.nextUrl.searchParams.get('stage') || 'awareness';
    const personaParam = request.nextUrl.searchParams.get('persona');
    const persona = personaParam && personaParam !== 'null' && personaParam !== '' ? personaParam : null;

    const targetName = targetVariantFor(stage, persona);
    // Sentinel that will never match any real variant_name — used when a
    // fallback level doesn't apply to the current view (e.g. persona is null).
    const NONE = '__none__';
    const personaStageName = persona && stage !== 'awareness' ? `persona_${persona}_stage_${stage}` : NONE;
    const personaName = persona ? `persona_${persona}` : NONE;
    const stageName = stage !== 'awareness' ? `stage_${stage}` : NONE;

    let zones;
    if (pageSlug) {
      // Five LEFT JOINs — each hits the UNIQUE(zone_id, market_id, variant_name)
      // index and returns at most one row per zone. COALESCE picks the most
      // specific variant that exists; `inherited_from` tells the UI which one.
      zones = await sql`
        SELECT
          cz.*,
          COALESCE(tgt.id, ps.id, p.id, s.id, c.id) as variant_id,
          COALESCE(tgt.variant_name, ps.variant_name, p.variant_name, s.variant_name, c.variant_name) as variant_name,
          COALESCE(tgt.content, ps.content, p.content, s.content, c.content) as variant_content,
          COALESCE(tgt.status, ps.status, p.status, s.status, c.status) as variant_status,
          COALESCE(tgt.updated_at, ps.updated_at, p.updated_at, s.updated_at, c.updated_at) as variant_updated_at,
          CASE
            WHEN tgt.id IS NOT NULL THEN 'custom'
            WHEN ps.id IS NOT NULL THEN 'persona_stage'
            WHEN p.id IS NOT NULL THEN 'persona'
            WHEN s.id IS NOT NULL THEN 'stage'
            WHEN c.id IS NOT NULL THEN 'control'
            ELSE 'default'
          END as inherited_from,
          (tgt.id IS NOT NULL) as has_stage_override,
          ${targetName} as target_variant_name
        FROM content_zones cz
        LEFT JOIN content_variants tgt ON tgt.zone_id = cz.id
          AND tgt.variant_name = ${targetName}
          ${marketId ? sql`AND tgt.market_id = ${marketId}` : sql``}
        LEFT JOIN content_variants ps ON ps.zone_id = cz.id
          AND ps.variant_name = ${personaStageName}
          ${marketId ? sql`AND ps.market_id = ${marketId}` : sql``}
        LEFT JOIN content_variants p ON p.zone_id = cz.id
          AND p.variant_name = ${personaName}
          ${marketId ? sql`AND p.market_id = ${marketId}` : sql``}
        LEFT JOIN content_variants s ON s.zone_id = cz.id
          AND s.variant_name = ${stageName}
          ${marketId ? sql`AND s.market_id = ${marketId}` : sql``}
        LEFT JOIN content_variants c ON c.zone_id = cz.id
          AND c.variant_name = 'control'
          ${marketId ? sql`AND c.market_id = ${marketId}` : sql``}
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
  } catch (e) {
    console.error('[cms zones GET]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// POST: Seed zones from the registry
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
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
  } catch (e) {
    console.error('[cms zones POST]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
