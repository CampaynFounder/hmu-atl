import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

// GET: List all funnel stages
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const stages = await sql`
    SELECT * FROM funnel_stages ORDER BY sort_order ASC
  `;

  return NextResponse.json({ stages });
}

// POST: Create a new funnel stage
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { slug, label, color, description } = body;

  if (!slug || !label) {
    return NextResponse.json({ error: 'slug and label required' }, { status: 400 });
  }

  // Get next sort_order
  const maxRows = await sql`SELECT COALESCE(MAX(sort_order), 0) as max_order FROM funnel_stages`;
  const nextOrder = (maxRows[0].max_order as number) + 1;

  const rows = await sql`
    INSERT INTO funnel_stages (slug, label, sort_order, color, description)
    VALUES (${slug}, ${label}, ${nextOrder}, ${color || '#448AFF'}, ${description || null})
    RETURNING id
  `;

  await logAdminAction(admin.id, 'funnel_stage_created', 'funnel_stage', rows[0].id as string, { slug, label });

  return NextResponse.json({ id: rows[0].id });
}

// PATCH: Update a funnel stage
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const body = await request.json();
  const { id, label, color, description, sort_order } = body;

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  await sql`
    UPDATE funnel_stages
    SET label = COALESCE(${label || null}, label),
        color = COALESCE(${color || null}, color),
        description = COALESCE(${description ?? null}, description),
        sort_order = COALESCE(${sort_order ?? null}, sort_order)
    WHERE id = ${id}
  `;

  await logAdminAction(admin.id, 'funnel_stage_updated', 'funnel_stage', id);

  return NextResponse.json({ ok: true });
}

// DELETE: Remove a funnel stage (cannot delete default)
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  // Check if default
  const rows = await sql`SELECT is_default FROM funnel_stages WHERE id = ${id}`;
  if (rows.length > 0 && rows[0].is_default) {
    return NextResponse.json({ error: 'Cannot delete the default stage' }, { status: 400 });
  }

  await sql`DELETE FROM funnel_stages WHERE id = ${id}`;
  await logAdminAction(admin.id, 'funnel_stage_deleted', 'funnel_stage', id);

  return NextResponse.json({ ok: true });
}
