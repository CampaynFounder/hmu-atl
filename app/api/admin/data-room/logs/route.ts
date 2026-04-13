import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorizedResponse();

    const logs = await sql`
      SELECT
        l.id,
        l.consent_id,
        c.full_name,
        c.email,
        c.company,
        d.name AS document_name,
        l.action,
        l.ip_address,
        l.accessed_at
      FROM data_room_access_logs l
      LEFT JOIN data_room_consents c ON l.consent_id = c.id
      LEFT JOIN data_room_documents d ON l.document_id = d.id
      ORDER BY l.accessed_at DESC
      LIMIT 500
    `;

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Admin data room logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}
