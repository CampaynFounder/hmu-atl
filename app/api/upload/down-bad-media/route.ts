// POST /api/upload/down-bad-media
//
// Accepts a required `file` (image/* or video/*) and an optional `poster`
// (image/jpeg blob extracted client-side from the first frame of a video).
//
// R2 key layout:
//   {market}/down-bad/{clerkId}/{timestamp}.{ext}          ← primary media
//   {market}/down-bad/{clerkId}/{timestamp}_poster.jpg     ← video poster (if provided)
//
// Returns: { mediaUrl, posterUrl?, mediaType: 'photo'|'video' }
// Does NOT auto-save to any profile table — caller stores URLs in hmu_posts.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sql } from '@/lib/db/client';

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

async function getMarketSlug(clerkId: string): Promise<string> {
  const rows = await sql`
    SELECT COALESCE(m.slug, 'atl') AS slug
    FROM users u
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  return ((rows[0] as { slug?: string } | undefined)?.slug) || 'atl';
}

function getBucket(env: Record<string, unknown>) {
  return (env as Record<string, unknown>).MEDIA_BUCKET as {
    put: (key: string, value: ArrayBuffer, options?: Record<string, unknown>) => Promise<unknown>;
  } | undefined;
}

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

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
  if (!bucket) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
  }

  const marketSlug = await getMarketSlug(clerkId);
  const timestamp = Date.now();
  const ext = MIME_TO_EXT[file.type] || file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
  const baseKey = `${marketSlug}/down-bad/${clerkId}/${timestamp}`;
  const mediaKey = `${baseKey}.${ext}`;

  // Upload primary file
  const mediaBuffer = await file.arrayBuffer();
  await bucket.put(mediaKey, mediaBuffer, {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      userId: clerkId,
      market: marketSlug,
      purpose: 'down_bad_sum_extra',
      uploadedAt: new Date().toISOString(),
    },
  });
  const mediaUrl = `${R2_PUBLIC_URL}/${mediaKey}`;

  // Upload poster frame for video (extracted client-side)
  let posterUrl: string | null = null;
  if (isVideo && poster && poster.size > 0) {
    const posterKey = `${baseKey}_poster.jpg`;
    const posterBuffer = await poster.arrayBuffer();
    await bucket.put(posterKey, posterBuffer, {
      httpMetadata: { contentType: 'image/jpeg' },
      customMetadata: {
        userId: clerkId,
        market: marketSlug,
        purpose: 'down_bad_poster',
        uploadedAt: new Date().toISOString(),
      },
    });
    posterUrl = `${R2_PUBLIC_URL}/${posterKey}`;
  }

  return NextResponse.json({
    mediaUrl,
    posterUrl,
    mediaType: isVideo ? 'video' : 'photo',
  });
}
