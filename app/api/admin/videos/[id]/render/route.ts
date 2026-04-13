import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

/**
 * Streams Remotion render output via Server-Sent Events.
 * Only works locally — child_process is unavailable on Cloudflare Workers.
 *
 * GET /api/admin/videos/[id]/render?action=render   — render the video
 * GET /api/admin/videos/[id]/render?action=preview  — start Remotion Studio
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminRows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!adminRows[0]?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Guard: only works locally
  let spawn: typeof import('child_process').spawn;
  let writeFileSync: typeof import('fs').writeFileSync;
  let mkdirSync: typeof import('fs').mkdirSync;
  let resolve: typeof import('path').resolve;
  try {
    const cp = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    spawn = cp.spawn;
    writeFileSync = fs.writeFileSync;
    mkdirSync = fs.mkdirSync;
    resolve = path.resolve;
  } catch {
    return NextResponse.json(
      { error: 'Rendering is only available when running locally (not on Cloudflare Workers).' },
      { status: 501 }
    );
  }

  const { id } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'render';

  // Fetch config
  const rows = await sql`SELECT * FROM video_configs WHERE id = ${id}`;
  if (!rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const config = rows[0];

  const videosDir = resolve(process.cwd(), 'videos');
  const compositionId = config.composition_id;
  const outFile = compositionId.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1);

  // Write props JSON
  const propsDir = resolve(videosDir, 'props');
  mkdirSync(propsDir, { recursive: true });
  mkdirSync(resolve(videosDir, 'out'), { recursive: true });

  const props = {
    title: config.intro_title || config.title,
    steps: config.steps,
    recordingFile: config.recording_file,
    introSec: Number(config.intro_sec),
    videoSec: Number(config.video_sec),
    endSec: Number(config.end_sec),
    titleCardDurationSec: Number(config.title_card_duration_sec),
    captionDurationSec: Number(config.caption_duration_sec),
    endTagline: config.end_tagline,
    endCta: config.end_cta,
  };
  const propsFile = resolve(propsDir, `${compositionId}.json`);
  writeFileSync(propsFile, JSON.stringify(props, null, 2));

  // Build the command
  let command: string;
  let args: string[];

  if (action === 'preview') {
    command = 'npx';
    args = ['remotion', 'studio'];
  } else {
    command = 'npx';
    args = [
      'remotion', 'render',
      'src/index.ts', compositionId,
      `out/${outFile}.mp4`,
      '--props', `props/${compositionId}.json`,
    ];
  }

  // Stream output as SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('status', `Starting: ${command} ${args.join(' ')}`);
      send('status', `Working directory: ${videosDir}`);

      const child = spawn(command, args, {
        cwd: videosDir,
        env: { ...process.env, FORCE_COLOR: '0' },
        shell: true,
      });

      child.stdout?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          send('stdout', line);
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          send('stderr', line);
        }
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          send('done', action === 'preview'
            ? 'Remotion Studio started'
            : `Rendered successfully: videos/out/${outFile}.mp4`
          );
        } else {
          send('error', `Process exited with code ${code}`);
        }
        controller.close();
      });

      child.on('error', (err: Error) => {
        send('error', err.message);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
