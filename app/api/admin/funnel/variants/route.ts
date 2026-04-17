import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

export const dynamic = 'force-dynamic';

function errorResponse(e: unknown, ctx: string) {
  const message = e instanceof Error ? e.message : 'Unknown error';
  console.error(`[cms variants ${ctx}]`, e);
  return NextResponse.json({ error: message }, { status: 500 });
}

// GET: List variants for a zone + market
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
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
  } catch (e) {
    return errorResponse(e, 'GET');
  }
}

// POST: Create or update a variant (auto-creates version). Atomic upsert.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { zone_id, market_id, variant_name, content, seo_keywords, utm_targets, save_status } = body;

    if (!zone_id || !market_id || content === undefined || content === null) {
      return NextResponse.json(
        { error: 'zone_id, market_id, and content required' },
        { status: 400 },
      );
    }

    const name = variant_name || 'control';
    const status = save_status === 'pending_approval' ? 'pending_approval' : 'published';
    const isPending = status === 'pending_approval';
    const nowIso = new Date().toISOString();
    const approvalBy = isPending ? admin.id : null;
    const approvalAt = isPending ? nowIso : null;
    const initialPublishedAt = isPending ? null : nowIso;

    // Atomic upsert — no SELECT-then-INSERT race. ON CONFLICT hits the
    // UNIQUE(zone_id, market_id, variant_name) constraint and updates in place.
    const upserted = await sql`
      INSERT INTO content_variants (
        zone_id, market_id, variant_name, content, seo_keywords, utm_targets,
        status, published_at, approval_requested_by, approval_requested_at,
        created_by, updated_by
      )
      VALUES (
        ${zone_id}, ${market_id}, ${name},
        ${JSON.stringify(content)},
        ${seo_keywords || null},
        ${utm_targets ? JSON.stringify(utm_targets) : null},
        ${status}, ${initialPublishedAt}, ${approvalBy}, ${approvalAt},
        ${admin.id}, ${admin.id}
      )
      ON CONFLICT (zone_id, market_id, variant_name) DO UPDATE SET
        content = EXCLUDED.content,
        seo_keywords = EXCLUDED.seo_keywords,
        utm_targets = EXCLUDED.utm_targets,
        status = EXCLUDED.status,
        published_at = CASE
          WHEN EXCLUDED.status = 'pending_approval' THEN NULL
          ELSE COALESCE(content_variants.published_at, NOW())
        END,
        approval_requested_by = CASE
          WHEN EXCLUDED.status = 'pending_approval' THEN EXCLUDED.approval_requested_by
          ELSE NULL
        END,
        approval_requested_at = CASE
          WHEN EXCLUDED.status = 'pending_approval' THEN EXCLUDED.approval_requested_at
          ELSE NULL
        END,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *
    `;

    const variant = upserted[0];
    const variantId = variant.id as string;

    // Version number assigned atomically via subquery — no SELECT MAX + INSERT race.
    const versionRows = await sql`
      INSERT INTO content_versions (variant_id, version_number, content, status, change_summary, created_by)
      SELECT
        ${variantId},
        COALESCE(MAX(version_number), 0) + 1,
        ${JSON.stringify(content)},
        'draft',
        ${body.change_summary || null},
        ${admin.id}
      FROM content_versions WHERE variant_id = ${variantId}
      RETURNING version_number
    `;
    const nextVersion = versionRows[0]?.version_number as number | undefined;

    await logAdminAction(admin.id, 'cms_variant_saved', 'content_variant', variantId, {
      variant_name: name,
      version: nextVersion,
    });

    return NextResponse.json({
      variant_id: variantId,
      version: nextVersion,
      variant,
    });
  } catch (e) {
    return errorResponse(e, 'POST');
  }
}

// PATCH: Publish or archive a variant
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  try {
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
  } catch (e) {
    return errorResponse(e, 'PATCH');
  }
}
