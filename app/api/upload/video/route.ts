// Video Upload API
// Handles video uploads to Cloudflare R2 for rider/driver intro videos

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Cloudflare R2 configuration
// Note: R2 bindings are available in Cloudflare Workers/Pages environment
// For local development, you'll need to configure R2 credentials

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const profileType = formData.get('profile_type') as string; // 'rider' | 'driver'

    if (!videoFile) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedTypes.includes(videoFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only MP4, WebM, and MOV are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (videoFile.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 50MB.' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = videoFile.name.split('.').pop();
    const fileName = `${profileType}/${clerkId}/${timestamp}.${fileExtension}`;

    // Convert File to ArrayBuffer
    const arrayBuffer = await videoFile.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // Check if R2 binding is available (Cloudflare environment)
    // @ts-ignore - R2 binding from Cloudflare
    const R2_BUCKET = process.env.R2_BUCKET || globalThis.R2_BUCKET;

    if (R2_BUCKET) {
      // Upload to R2 (Cloudflare Workers/Pages environment)
      await R2_BUCKET.put(fileName, buffer, {
        httpMetadata: {
          contentType: videoFile.type,
        },
        customMetadata: {
          userId: clerkId,
          profileType: profileType || 'unknown',
          uploadedAt: new Date().toISOString(),
        },
      });

      // Generate public URL
      const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';
      const videoUrl = `${R2_PUBLIC_URL}/${fileName}`;

      return NextResponse.json({
        success: true,
        videoUrl,
        fileName,
        size: videoFile.size,
        type: videoFile.type,
      });
    } else {
      // Fallback: Return a placeholder for development
      // In production, this would be an error
      const isDevelopment = process.env.NODE_ENV === 'development';

      if (isDevelopment) {
        console.warn('⚠️  R2 not configured - using placeholder URL for development');
        return NextResponse.json({
          success: true,
          videoUrl: `/api/placeholder/video/${fileName}`,
          fileName,
          size: videoFile.size,
          type: videoFile.type,
          warning: 'Using placeholder - R2 not configured',
        });
      } else {
        return NextResponse.json(
          { error: 'Video storage not configured' },
          { status: 500 }
        );
      }
    }
  } catch (error) {
    console.error('Video Upload Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload video',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE endpoint to remove uploaded videos
export async function DELETE(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('fileName');

    if (!fileName) {
      return NextResponse.json(
        { error: 'fileName parameter required' },
        { status: 400 }
      );
    }

    // Verify the file belongs to the user
    if (!fileName.includes(clerkId)) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this file' },
        { status: 403 }
      );
    }

    // @ts-ignore - R2 binding from Cloudflare
    const R2_BUCKET = process.env.R2_BUCKET || globalThis.R2_BUCKET;

    if (R2_BUCKET) {
      await R2_BUCKET.delete(fileName);

      return NextResponse.json({
        success: true,
        message: 'Video deleted successfully',
      });
    } else {
      return NextResponse.json(
        { error: 'Video storage not configured' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Video Delete Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete video' },
      { status: 500 }
    );
  }
}
