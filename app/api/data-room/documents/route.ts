import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  try {
    const consentId = request.headers.get('x-consent-id');
    if (!consentId) {
      return NextResponse.json({ error: 'Consent required' }, { status: 401 });
    }

    // Verify consent exists and isn't revoked
    const consent = await sql`
      SELECT id FROM data_room_consents
      WHERE id = ${consentId} AND revoked_at IS NULL
    `;
    if (consent.length === 0) {
      return NextResponse.json({ error: 'Invalid or revoked consent' }, { status: 401 });
    }

    const documents = await sql`
      SELECT id, name, description, category, file_name, file_type,
             file_size_bytes, version, created_at, updated_at
      FROM data_room_documents
      WHERE is_active = true
      ORDER BY
        CASE category
          WHEN 'one_pager' THEN 1
          WHEN 'pitch_deck' THEN 2
          WHEN 'financials' THEN 3
          WHEN 'legal' THEN 4
          ELSE 5
        END,
        updated_at DESC
    `;

    // Log view access
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
    await sql`
      INSERT INTO data_room_access_logs (consent_id, action, ip_address)
      VALUES (${consentId}, 'view', ${ip})
    `;

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Data room documents error:', error);
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}
