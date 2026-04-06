import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const R2_PUBLIC_URL = 'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const consentId = request.headers.get('x-consent-id') ||
      request.nextUrl.searchParams.get('consent');

    if (!consentId) {
      return NextResponse.json({ error: 'Consent required' }, { status: 401 });
    }

    // Verify consent
    const consent = await sql`
      SELECT id FROM data_room_consents
      WHERE id = ${consentId} AND revoked_at IS NULL
    `;
    if (consent.length === 0) {
      return NextResponse.json({ error: 'Invalid or revoked consent' }, { status: 401 });
    }

    // Get document
    const docs = await sql`
      SELECT id, name, file_key, file_name, file_type, file_size_bytes
      FROM data_room_documents
      WHERE id = ${id} AND is_active = true
    `;
    if (docs.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const doc = docs[0];

    // Log download
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown';
    await sql`
      INSERT INTO data_room_access_logs (consent_id, document_id, action, ip_address)
      VALUES (${consentId}, ${id}, 'download', ${ip})
    `;

    // Try R2 direct fetch, fall back to public URL
    try {
      const { env } = await getCloudflareContext();
      const bucket = (env as any).MEDIA_BUCKET;
      if (bucket) {
        const object = await bucket.get(doc.file_key);
        if (object) {
          const headers = new Headers();
          headers.set('Content-Type', doc.file_type);
          headers.set('Content-Disposition', `attachment; filename="${doc.file_name}"`);
          headers.set('Content-Length', String(doc.file_size_bytes));
          return new NextResponse(object.body, { headers });
        }
      }
    } catch {
      // Fall through to redirect
    }

    // Fallback: redirect to public R2 URL
    const publicUrl = `${R2_PUBLIC_URL}/${doc.file_key}`;
    return NextResponse.redirect(publicUrl);
  } catch (error) {
    console.error('Data room download error:', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
