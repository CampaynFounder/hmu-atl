import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const R2_PUBLIC_URL = 'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';
const R2_PREFIX = 'pitch/';

type R2Object = { key: string; size: number; uploaded: string };
type R2ListResult = { objects: R2Object[]; truncated: boolean };
type R2Bucket = {
  list: (opts: { prefix: string }) => Promise<R2ListResult>;
  put: (key: string, value: ArrayBuffer, opts?: Record<string, unknown>) => Promise<unknown>;
  delete: (key: string) => Promise<void>;
  head: (key: string) => Promise<R2Object | null>;
};

function getBucket(): R2Bucket | null {
  const { env } = getCloudflareContext();
  return ((env as Record<string, unknown>).MEDIA_BUCKET as R2Bucket) || null;
}

// GET — list all pitch videos in R2
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bucket = getBucket();
  if (!bucket) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
  }

  const result = await bucket.list({ prefix: R2_PREFIX });
  const videos: Record<string, { url: string; size: number; uploaded: string }> = {};

  for (const obj of result.objects) {
    // key is "pitch/driver-cash-ride.mp4" → chapterId is "driver-cash-ride"
    const filename = obj.key.replace(R2_PREFIX, '');
    const chapterId = filename.replace(/\.[^.]+$/, '');
    if (chapterId) {
      videos[chapterId] = {
        url: `${R2_PUBLIC_URL}/${obj.key}`,
        size: obj.size,
        uploaded: obj.uploaded,
      };
    }
  }

  return NextResponse.json(videos);
}

// POST — upload a pitch video
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bucket = getBucket();
  if (!bucket) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('video') as File;
  const chapterId = formData.get('chapterId') as string;

  if (!file || !chapterId) {
    return NextResponse.json({ error: 'Missing video file or chapterId' }, { status: 400 });
  }

  if (!file.type.startsWith('video/')) {
    return NextResponse.json({ error: 'Only video files allowed' }, { status: 400 });
  }

  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 50MB.' }, { status: 400 });
  }

  const key = `${R2_PREFIX}${chapterId}.mp4`;
  const arrayBuffer = await file.arrayBuffer();

  await bucket.put(key, arrayBuffer, {
    httpMetadata: { contentType: 'video/mp4' },
    customMetadata: {
      chapterId,
      uploadedBy: userId,
      uploadedAt: new Date().toISOString(),
    },
  });

  const url = `${R2_PUBLIC_URL}/${key}`;

  return NextResponse.json({ success: true, chapterId, url, size: file.size });
}

// DELETE — remove a pitch video
export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bucket = getBucket();
  if (!bucket) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
  }

  const { chapterId } = await request.json();
  if (!chapterId) {
    return NextResponse.json({ error: 'Missing chapterId' }, { status: 400 });
  }

  const key = `${R2_PREFIX}${chapterId}.mp4`;
  await bucket.delete(key);

  return NextResponse.json({ success: true, chapterId });
}
