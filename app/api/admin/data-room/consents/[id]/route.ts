import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorizedResponse();

    const { id } = await params;

    const consentRows = await sql`
      SELECT id, full_name, email, phone, company, title,
             consented_at, nda_version, ip_address, user_agent,
             access_code_used, revoked_at
      FROM data_room_consents
      WHERE id = ${id}
      LIMIT 1
    `;
    if (consentRows.length === 0) {
      return NextResponse.json({ error: 'Consent not found' }, { status: 404 });
    }

    const accessLogs = await sql`
      SELECT
        l.id, l.action, l.accessed_at, l.ip_address,
        d.id AS document_id, d.name AS document_name,
        d.category, d.version
      FROM data_room_access_logs l
      LEFT JOIN data_room_documents d ON l.document_id = d.id
      WHERE l.consent_id = ${id}
      ORDER BY l.accessed_at DESC
    `;

    return NextResponse.json({
      consent: consentRows[0],
      accessLogs,
    });
  } catch (error) {
    console.error('Admin consent detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch consent' }, { status: 500 });
  }
}
