import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorizedResponse();

    const rows = await sql`
      SELECT
        c.full_name, c.email, c.phone, c.company, c.title,
        c.consented_at, c.nda_version, c.ip_address,
        COUNT(l.id)::int AS access_count,
        MAX(l.accessed_at) AS last_access_at
      FROM data_room_consents c
      LEFT JOIN data_room_access_logs l ON l.consent_id = c.id
      WHERE c.revoked_at IS NULL
      GROUP BY c.id
      ORDER BY c.consented_at DESC
    `;

    const header = ['Full Name','Email','Phone','Company','Title','Consented At','NDA Version','IP','Access Count','Last Access'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        csvCell(r.full_name),
        csvCell(r.email),
        csvCell(r.phone),
        csvCell(r.company),
        csvCell(r.title),
        csvCell(r.consented_at),
        csvCell(r.nda_version),
        csvCell(r.ip_address),
        csvCell(r.access_count),
        csvCell(r.last_access_at),
      ].join(','));
    }

    const csv = lines.join('\n');
    const filename = `data-room-consents-${new Date().toISOString().slice(0,10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Admin consent export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
