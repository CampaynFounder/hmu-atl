import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

async function verifyAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return false;
  const rows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  return rows[0]?.is_admin === true;
}

export async function GET() {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await sql`
    SELECT * FROM video_configs
    ORDER BY created_at ASC
  `;

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const {
    compositionId,
    title,
    recordingFile,
    introTitle,
    introSec = 3,
    videoSec,
    endSec = 5,
    titleCardDurationSec = 2,
    captionDurationSec = 5,
    endTagline = 'Your city. Your ride. Your rules.',
    endCta = 'HMU ATL',
    steps = [],
  } = body;

  if (!compositionId || !title || !recordingFile || !videoSec) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const stepsJson = JSON.stringify(steps);
  const rows = await sql`
    INSERT INTO video_configs (
      composition_id, title, recording_file, intro_title,
      intro_sec, video_sec, end_sec, title_card_duration_sec,
      caption_duration_sec, end_tagline, end_cta, steps
    ) VALUES (
      ${compositionId}, ${title}, ${recordingFile}, ${introTitle},
      ${introSec}, ${videoSec}, ${endSec}, ${titleCardDurationSec},
      ${captionDurationSec}, ${endTagline}, ${endCta}, ${stepsJson}::jsonb
    )
    RETURNING *
  `;

  return NextResponse.json(rows[0], { status: 201 });
}
