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
  const {
    title,
    recordingFile,
    introTitle,
    introSec,
    videoSec,
    endSec,
    titleCardDurationSec,
    captionDurationSec,
    endTagline,
    endCta,
    steps,
    isActive,
  } = body;

  const stepsJson = steps ? JSON.stringify(steps) : null;
  const rows = await sql`
    UPDATE video_configs SET
      title = COALESCE(${title ?? null}, title),
      recording_file = COALESCE(${recordingFile ?? null}, recording_file),
      intro_title = COALESCE(${introTitle ?? null}, intro_title),
      intro_sec = COALESCE(${introSec ?? null}, intro_sec),
      video_sec = COALESCE(${videoSec ?? null}, video_sec),
      end_sec = COALESCE(${endSec ?? null}, end_sec),
      title_card_duration_sec = COALESCE(${titleCardDurationSec ?? null}, title_card_duration_sec),
      caption_duration_sec = COALESCE(${captionDurationSec ?? null}, caption_duration_sec),
      end_tagline = COALESCE(${endTagline ?? null}, end_tagline),
      end_cta = COALESCE(${endCta ?? null}, end_cta),
      steps = COALESCE(${stepsJson}::jsonb, steps),
      is_active = COALESCE(${isActive ?? null}, is_active),
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
