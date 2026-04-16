import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

// GET: List flags, optionally filtered by market
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const marketId = request.nextUrl.searchParams.get('market_id');

  const flags = marketId
    ? await sql`
        SELECT cff.*, m.slug as market_slug
        FROM content_feature_flags cff
        JOIN markets m ON m.id = cff.market_id
        WHERE cff.market_id = ${marketId}
        ORDER BY cff.flag_key ASC
      `
    : await sql`
        SELECT cff.*, m.slug as market_slug
        FROM content_feature_flags cff
        JOIN markets m ON m.id = cff.market_id
        ORDER BY cff.flag_key ASC
      `;

  return NextResponse.json({ flags });
}

// POST: Create a flag
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { flag_key, market_id, audience, enabled, description } = body;

  if (!flag_key || !market_id) {
    return NextResponse.json({ error: 'flag_key and market_id required' }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO content_feature_flags (flag_key, market_id, audience, enabled, description, updated_by)
    VALUES (${flag_key}, ${market_id}, ${audience || 'all'}, ${enabled ?? true}, ${description || null}, ${admin.id})
    ON CONFLICT (flag_key, market_id, audience) DO UPDATE
    SET enabled = EXCLUDED.enabled, description = EXCLUDED.description, updated_by = EXCLUDED.updated_by, updated_at = NOW()
    RETURNING id
  `;

  await logAdminAction(admin.id, 'cms_flag_upserted', 'content_feature_flag', rows[0].id as string, { flag_key, enabled });

  return NextResponse.json({ id: rows[0].id });
}

// PATCH: Toggle a flag
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { flag_id, enabled } = body;

  if (!flag_id || enabled === undefined) {
    return NextResponse.json({ error: 'flag_id and enabled required' }, { status: 400 });
  }

  await sql`
    UPDATE content_feature_flags
    SET enabled = ${enabled}, updated_by = ${admin.id}, updated_at = NOW()
    WHERE id = ${flag_id}
  `;

  await logAdminAction(admin.id, `cms_flag_${enabled ? 'enabled' : 'disabled'}`, 'content_feature_flag', flag_id);

  return NextResponse.json({ ok: true });
}
