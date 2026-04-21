import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sql } from '@/lib/db/client';

const R2_PUBLIC_URL = 'https://pub-649c30e78a62433eb6ed9cb1209d112a.r2.dev';

// Resolve the uploader's market slug for R2 key prefixing. Existing objects
// uploaded before market prefixing (2026-04 and earlier) have keys without a
// market prefix — those URLs are stored in the DB as full R2 public URLs and
// continue to serve without any migration. Only NEW uploads get prefixed.
async function getMarketSlugForClerkUser(clerkId: string): Promise<string> {
  const rows = await sql`
    SELECT COALESCE(m.slug, 'atl') AS slug
    FROM users u
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.clerk_id = ${clerkId}
    LIMIT 1
  `;
  return ((rows[0] as { slug?: string } | undefined)?.slug) || 'atl';
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('video') as File;
    const profileType = (formData.get('profile_type') as string) || 'driver';
    const mediaType = (formData.get('media_type') as string) || 'auto';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      return NextResponse.json({ error: 'Only video and image files are allowed' }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 50MB.' }, { status: 400 });
    }

    // Generate unique path — use MIME type for extension, not filename
    const timestamp = Date.now();
    const mimeToExt: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mp4',
      'video/webm': 'webm',
      'video/x-matroska': 'mkv',
      'video/3gpp': '3gp',
      'video/avi': 'avi',
      'video/x-msvideo': 'avi',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'jpg',
      'image/heif': 'jpg',
    };
    const ext = mimeToExt[file.type] || file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
    const folder = isVideo ? 'videos' : 'photos';
    // Market-prefixed keys: <market>/<profile>/<user>/<folder>/<ts>.<ext>
    // Enables per-market listing, lifecycle policy, and future migration to
    // dedicated per-market buckets without touching upload code.
    const marketSlug = await getMarketSlugForClerkUser(clerkId);
    const fileName = `${marketSlug}/${profileType}/${clerkId}/${folder}/${timestamp}.${ext}`;

    // Get R2 bucket via Cloudflare context
    const { env } = getCloudflareContext();
    const bucket = (env as Record<string, unknown>).MEDIA_BUCKET as {
      put: (key: string, value: ArrayBuffer, options?: Record<string, unknown>) => Promise<unknown>;
    } | undefined;

    if (!bucket) {
      console.error('MEDIA_BUCKET binding not found in Cloudflare context');
      return NextResponse.json({ error: 'Storage not configured' }, { status: 500 });
    }

    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(fileName, arrayBuffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        userId: clerkId,
        profileType,
        market: marketSlug,
        uploadedAt: new Date().toISOString(),
      },
    });

    const publicUrl = `${R2_PUBLIC_URL}/${fileName}`;

    // Auto-save to profile
    const saveToProfile = formData.get('save_to_profile') !== 'false';
    if (saveToProfile) {
      const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
      if (userRows.length) {
        const userId = (userRows[0] as { id: string }).id;
        const resolvedType = mediaType === 'auto' ? (isVideo ? 'video' : 'photo') : mediaType;

        if (profileType === 'driver') {
          if (resolvedType === 'vibe') {
            await sql`
              UPDATE driver_profiles
              SET vibe_video_url = ${publicUrl}
              WHERE user_id = ${userId}
            `;
          } else if (resolvedType === 'video') {
            await sql`
              UPDATE driver_profiles
              SET video_url = ${publicUrl}, thumbnail_url = ${publicUrl}
              WHERE user_id = ${userId}
            `;
          } else {
            await sql`
              UPDATE driver_profiles
              SET vehicle_info = jsonb_set(COALESCE(vehicle_info, '{}')::jsonb, '{photo_url}', ${JSON.stringify(publicUrl)}::jsonb)
              WHERE user_id = ${userId}
            `;
          }
        } else if (profileType === 'rider') {
          if (resolvedType === 'vibe') {
            await sql`
              UPDATE rider_profiles
              SET vibe_video_url = ${publicUrl}
              WHERE user_id = ${userId}
            `;
          } else if (resolvedType === 'video') {
            await sql`
              UPDATE rider_profiles
              SET video_url = ${publicUrl}, thumbnail_url = ${publicUrl}
              WHERE user_id = ${userId}
            `;
          } else {
            await sql`
              UPDATE rider_profiles
              SET avatar_url = ${publicUrl}
              WHERE user_id = ${userId}
            `;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      videoUrl: publicUrl,
      thumbnailUrl: publicUrl,
      fileName,
      size: file.size,
      type: file.type,
      isVideo,
      isImage,
    });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
