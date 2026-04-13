import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

/**
 * Returns the Remotion-compatible props JSON for a video config.
 * Used by the render script to pass --props to Remotion CLI.
 * No auth required — only called from local CLI during rendering.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await sql`SELECT * FROM video_configs WHERE id = ${id}`;
  if (!rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const c = rows[0];
  const props = {
    title: c.intro_title || c.title,
    steps: c.steps,
    recordingFile: c.recording_file,
    introSec: Number(c.intro_sec),
    videoSec: Number(c.video_sec),
    endSec: Number(c.end_sec),
    titleCardDurationSec: Number(c.title_card_duration_sec),
    captionDurationSec: Number(c.caption_duration_sec),
    endTagline: c.end_tagline,
    endCta: c.end_cta,
  };

  return NextResponse.json(props);
}
