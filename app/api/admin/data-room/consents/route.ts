import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorizedResponse();

    const consents = await sql`
      SELECT
        c.id, c.full_name, c.email, c.phone, c.company, c.title,
        c.consented_at, c.nda_version, c.ip_address,
        COUNT(l.id)::int AS access_count,
        MAX(l.accessed_at) AS last_access_at
      FROM data_room_consents c
      LEFT JOIN data_room_access_logs l ON l.consent_id = c.id
      WHERE c.revoked_at IS NULL
      GROUP BY c.id
      ORDER BY c.consented_at DESC
    `;

    return NextResponse.json({ consents });
  } catch (error) {
    console.error('Admin data room consents error:', error);
    return NextResponse.json({ error: 'Failed to fetch consents' }, { status: 500 });
  }
}
