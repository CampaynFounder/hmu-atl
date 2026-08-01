// POST /api/admin/seed-users/upload
//
// Admin-only R2 upload for seed profile + advertisement media. Mirrors the R2
// put pattern in app/api/upload/down-bad-media (bucket MEDIA_BUCKET), but keys
// live under `seed/{kind}/…` and carry no clerk id (seed users have none).
//
// Body: multipart form — `file` (image/* or video/*), optional `poster`
// (image/jpeg first frame for videos), `kind` ('driver'|'rider'|'ad').
// Returns: { mediaUrl, posterUrl?, mediaType: 'photo'|'video' }

import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { requireAdmin, unauthorizedResponse } from '@/lib/admin/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const R2_PUBLIC_URL =
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
  'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';

const MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mp4',
  'video/webm': 'webm',
  'video/3gpp': '3gp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'jpg',
  'image/heif': 'jpg',
};

function getBucket(env: Record<string, unknown>) {
  return (env as Record<string, unknown>).MEDIA_BUCKET as {
    put: (key: string, value: ArrayBuffer, options?: Record<string, unknown>) => Promise<unknown>;
  } | undefined;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin || !admin.is_super) return unauthorizedResponse();

  let formData: FormData;
  try { formData = await req.formData(); } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const kindRaw = String(formData.get('kind') || 'driver');
  const kind = ['driver', 'rider', 'ad', 'comment'].includes(kindRaw) ? kindRaw : 'driver';

  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');
  if (!isVideo && !isImage) {
    return NextResponse.json({ error: 'Only photo and video files are allowed' }, { status: 400 });
  }
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 100 MB.' }, { status: 400 });
  }

  const poster = formData.get('poster') as File | null;

  const { env } = getCloudflareContext();
  const bucket = getBucket(env as Record<string, unknown>);
  if (!bucket) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });

  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const ext = MIME_TO_EXT[file.type] || file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
  const baseKey = `seed/${kind}/${timestamp}-${rand}`;
  const mediaKey = `${baseKey}.${ext}`;

  const meta = { adminId: admin.id, purpose: `seed_${kind}`, uploadedAt: new Date().toISOString() };

  await bucket.put(mediaKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
    customMetadata: meta,
  });
  const mediaUrl = `${R2_PUBLIC_URL}/${mediaKey}`;

  let posterUrl: string | null = null;
  if (isVideo && poster && poster.size > 0) {
    const posterKey = `${baseKey}_poster.jpg`;
    await bucket.put(posterKey, await poster.arrayBuffer(), {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: { ...meta, purpose: `seed_${kind}_poster` },
    });
    posterUrl = `${R2_PUBLIC_URL}/${posterKey}`;
  }

  return NextResponse.json({ mediaUrl, posterUrl, mediaType: isVideo ? 'video' : 'photo' });
}
