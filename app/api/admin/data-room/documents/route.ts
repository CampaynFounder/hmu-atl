import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorizedResponse();

    const documents = await sql`
      SELECT
        d.*,
        COUNT(l.id)::int AS access_count
      FROM data_room_documents d
      LEFT JOIN data_room_access_logs l ON l.document_id = d.id
      GROUP BY d.id
      ORDER BY d.is_active DESC, d.updated_at DESC
    `;

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Admin data room documents error:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}
