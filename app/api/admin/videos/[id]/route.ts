import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

async function verifyAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return false;
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  return rows[0]?.is_admin === true;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const rows = await sql`SELECT * FROM video_configs WHERE id = ${id}`;
  if (!rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const compositionIdVal = body.compositionId as string | undefined;
  const titleVal = body.title as string | undefined;
  const recordingFileVal = body.recordingFile as string | undefined;
  const introTitleVal = body.introTitle as string | undefined;
  const introSecVal = body.introSec as number | undefined;
  const videoSecVal = body.videoSec as number | undefined;
  const endSecVal = body.endSec as number | undefined;
  const titleCardVal = body.titleCardDurationSec as number | undefined;
  const captionVal = body.captionDurationSec as number | undefined;
  const endTaglineVal = body.endTagline as string | undefined;
  const endCtaVal = body.endCta as string | undefined;
  const stepsVal = body.steps as unknown[] | undefined;
  const isActiveVal = body.isActive as boolean | undefined;
  const phoneWidthVal = body.phoneWidth as number | undefined;
  const phoneHeightVal = body.phoneHeight as number | undefined;
  const mutedVal = typeof body.muted === 'boolean' ? body.muted : undefined;

  const stepsJson = stepsVal ? JSON.stringify(stepsVal) : null;
  const rows = await sql`
    UPDATE video_configs SET
      composition_id = COALESCE(${compositionIdVal ?? null}, composition_id),
      title = COALESCE(${titleVal ?? null}, title),
      recording_file = COALESCE(${recordingFileVal ?? null}, recording_file),
      intro_title = COALESCE(${introTitleVal ?? null}, intro_title),
      intro_sec = COALESCE(${introSecVal ?? null}, intro_sec),
      video_sec = COALESCE(${videoSecVal ?? null}, video_sec),
      end_sec = COALESCE(${endSecVal ?? null}, end_sec),
      title_card_duration_sec = COALESCE(${titleCardVal ?? null}, title_card_duration_sec),
      caption_duration_sec = COALESCE(${captionVal ?? null}, caption_duration_sec),
      end_tagline = COALESCE(${endTaglineVal ?? null}, end_tagline),
      end_cta = COALESCE(${endCtaVal ?? null}, end_cta),
      steps = COALESCE(${stepsJson}::jsonb, steps),
      is_active = COALESCE(${isActiveVal ?? null}, is_active),
      phone_width = COALESCE(${phoneWidthVal ?? null}, phone_width),
      phone_height = COALESCE(${phoneHeightVal ?? null}, phone_height),
      muted = CASE WHEN ${mutedVal ?? null} IS NOT NULL THEN ${mutedVal ?? false} ELSE muted END,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await sql`DELETE FROM video_configs WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
