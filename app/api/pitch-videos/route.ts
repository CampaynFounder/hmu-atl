import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const R2_PUBLIC_URL = 'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';
const R2_PREFIX = 'pitch/';

type R2Object = { key: string; size: number };
type R2ListResult = { objects: R2Object[]; truncated: boolean };

// Public — returns map of chapterId → video URL for the pitch page
export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const bucket = (env as Record<string, unknown>).MEDIA_BUCKET as {
      list: (opts: { prefix: string }) => Promise<R2ListResult>;
    } | undefined;

    if (!bucket) {
      return NextResponse.json({}, { headers: { 'Cache-Control': 'public, max-age=60' } });
    }

    const result = await bucket.list({ prefix: R2_PREFIX });
    const videos: Record<string, string> = {};

    for (const obj of result.objects) {
      const filename = obj.key.replace(R2_PREFIX, '');
      const chapterId = filename.replace(/\.[^.]+$/, '');
      if (chapterId) {
        videos[chapterId] = `${R2_PUBLIC_URL}/${obj.key}`;
      }
    }

    return NextResponse.json(videos, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
    });
  } catch {
    return NextResponse.json({}, { headers: { 'Cache-Control': 'public, max-age=60' } });
  }
}
