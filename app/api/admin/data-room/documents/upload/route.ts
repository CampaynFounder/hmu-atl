import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';

const R2_PUBLIC_URL = 'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';
const VALID_CATEGORIES = ['pitch_deck', 'financials', 'one_pager', 'legal', 'other'];
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return unauthorizedResponse();

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const category = formData.get('category') as string;
    const replaceId = formData.get('replaceId') as string | null;

    if (!file || !name || !category) {
      return NextResponse.json({ error: 'File, name, and category are required' }, { status: 400 });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum 100MB.' }, { status: 400 });
    }

    let version = 1;
    if (replaceId) {
      const oldDoc = await sql`
        SELECT version FROM data_room_documents WHERE id = ${replaceId}
      `;
      if (oldDoc.length > 0) {
        version = oldDoc[0].version + 1;
        await sql`
          UPDATE data_room_documents SET is_active = false, updated_at = NOW()
          WHERE id = ${replaceId}
        `;
      }
    }

    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'bin';
    const fileKey = `data-room/${category}/${timestamp}-v${version}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();

    try {
      const { env } = await getCloudflareContext();
      const bucket = (env as unknown as { MEDIA_BUCKET?: { put: (key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) => Promise<unknown> } }).MEDIA_BUCKET;
      if (bucket) {
        await bucket.put(fileKey, arrayBuffer, {
          httpMetadata: { contentType: file.type },
        });
      }
    } catch (e) {
      console.error('R2 upload failed:', e);
      return NextResponse.json({ error: 'File upload failed' }, { status: 500 });
    }

    const result = await sql`
      INSERT INTO data_room_documents (
        name, description, category, file_key, file_name,
        file_type, file_size_bytes, version, uploaded_by
      ) VALUES (
        ${name}, ${description || null}, ${category}, ${fileKey}, ${file.name},
        ${file.type}, ${file.size}, ${version}, ${admin.clerk_id}
      )
      RETURNING id, name, version, created_at
    `;

    await logAdminAction(admin.id, replaceId ? 'data_room.document.replace' : 'data_room.document.upload', 'data_room_document', result[0].id, {
      name, category, version, file_name: file.name, replaceId,
    });

    return NextResponse.json({
      document: result[0],
      url: `${R2_PUBLIC_URL}/${fileKey}`,
    });
  } catch (error) {
    console.error('Data room upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
