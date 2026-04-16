import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, hasPermission, logAdminAction } from '@/lib/admin/helpers';

// GET: List personas, optionally filtered by market and audience
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.funnel.view')) return unauthorizedResponse();

  const marketId = request.nextUrl.searchParams.get('market_id');
  const audience = request.nextUrl.searchParams.get('audience');

  const personas = await sql`
    SELECT p.*, m.slug as market_slug
    FROM personas p
    JOIN markets m ON m.id = p.market_id
    WHERE 1=1
      ${marketId ? sql`AND p.market_id = ${marketId}` : sql``}
      ${audience ? sql`AND (p.audience = ${audience} OR p.audience = 'all')` : sql``}
    ORDER BY p.audience, p.sort_order ASC
  `;

  return NextResponse.json({ personas });
}

// POST: Create a persona
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.funnel.edit')) return unauthorizedResponse();

  const body = await request.json();
  const { slug, label, description, audience, market_id, color } = body;

  if (!slug || !label || !market_id) {
    return NextResponse.json({ error: 'slug, label, and market_id required' }, { status: 400 });
  }

  // Get next sort_order
  const maxRows = await sql`SELECT COALESCE(MAX(sort_order), 0) as max_order FROM personas WHERE market_id = ${market_id}`;
  const nextOrder = (maxRows[0].max_order as number) + 1;

  try {
    const rows = await sql`
      INSERT INTO personas (slug, label, description, audience, market_id, color, sort_order)
      VALUES (${slug}, ${label}, ${description || null}, ${audience || 'all'}, ${market_id}, ${color || '#448AFF'}, ${nextOrder})
      RETURNING id
    `;

    await logAdminAction(admin.id, 'persona_created', 'persona', rows[0].id as string, { slug, label, audience });

    return NextResponse.json({ id: rows[0].id });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('unique constraint')) {
      return NextResponse.json({ error: 'A persona with this slug already exists in this market' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create persona' }, { status: 500 });
  }
}

// PATCH: Update a persona
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.funnel.edit')) return unauthorizedResponse();

  const body = await request.json();
  const { id, label, description, color, is_active, sort_order } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await sql`
    UPDATE personas
    SET label = COALESCE(${label || null}, label),
        description = COALESCE(${description ?? null}, description),
        color = COALESCE(${color || null}, color),
        is_active = COALESCE(${is_active ?? null}, is_active),
        sort_order = COALESCE(${sort_order ?? null}, sort_order)
    WHERE id = ${id}
  `;

  await logAdminAction(admin.id, 'persona_updated', 'persona', id);

  return NextResponse.json({ ok: true });
}

// DELETE: Delete a persona
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'grow.funnel.edit')) return unauthorizedResponse();

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await sql`DELETE FROM personas WHERE id = ${id}`;
  await logAdminAction(admin.id, 'persona_deleted', 'persona', id);

  return NextResponse.json({ ok: true });
}
