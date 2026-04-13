import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

const VALID_CATEGORIES = ['pitch_deck', 'financials', 'one_pager', 'legal', 'other'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorizedResponse();

    const { id } = await params;
    const body = await request.json();
    const { name, description, category } = body as {
      name?: string;
      description?: string | null;
      category?: string;
    };

    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    const rows = await sql`
      UPDATE data_room_documents SET
        name = COALESCE(${name ?? null}, name),
        description = CASE WHEN ${description !== undefined} THEN ${description ?? null} ELSE description END,
        category = COALESCE(${category ?? null}, category),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    await logAdminAction(admin.id, 'data_room.document.update', 'data_room_document', id, {
      name, description, category,
    });

    return NextResponse.json({ document: rows[0] });
  } catch (error) {
    console.error('Admin update document error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorizedResponse();

    const { id } = await params;

    await sql`
      UPDATE data_room_documents
      SET is_active = false, updated_at = NOW()
      WHERE id = ${id}
    `;

    await logAdminAction(admin.id, 'data_room.document.deactivate', 'data_room_document', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin deactivate document error:', error);
    return NextResponse.json({ error: 'Failed to deactivate' }, { status: 500 });
  }
}
