import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min for long renders

/**
 * POST /api/admin/videos/[id]/render?action=render|preview
 *
 * Streams Remotion CLI output as newline-delimited JSON.
 * Each line: { "type": "stdout"|"stderr"|"status"|"done"|"error", "text": "..." }
 *
 * Only works locally — child_process is unavailable on Cloudflare Workers.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const adminRows = await sql`SELECT is_admin FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
  if (!adminRows[0]?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Guard: only works on localhost — Cloudflare Workers has no filesystem or child_process
  const host = req.headers.get('host') || '';
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return NextResponse.json(
      { error: 'Rendering only works locally. Run `npm run dev` and use localhost:3000/admin/videos.' },
      { status: 501 }
    );
  }

  let spawn: typeof import('child_process').spawn;
  let writeFileSync: typeof import('fs').writeFileSync;
  let mkdirSync: typeof import('fs').mkdirSync;
  let existsSync: typeof import('fs').existsSync;
  let resolve: typeof import('path').resolve;
  try {
    const cp = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    spawn = cp.spawn;
    writeFileSync = fs.writeFileSync;
    mkdirSync = fs.mkdirSync;
    existsSync = fs.existsSync;
    resolve = path.resolve;
  } catch {
    return NextResponse.json(
      { error: 'Rendering only works locally. Run `npm run dev` and use localhost:3000/admin/videos.' },
      { status: 501 }
    );
  }

  const { id } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'render';

  // Fetch config
  const rows = await sql`SELECT * FROM video_configs WHERE id = ${id}`;
  if (!rows.length) {
    return NextResponse.json({ error: 'Video config not found' }, { status: 404 });
  }
  const config = rows[0];

  const videosDir = resolve(process.cwd(), 'videos');
  const compositionId = config.composition_id;
  const outFile = compositionId.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1);

  // Check that videos dir exists
  if (!existsSync(videosDir)) {
    return NextResponse.json(
      { error: `videos/ directory not found at ${videosDir}` },
      { status: 500 }
    );
  }

  // Check recording exists for render
  if (action === 'render') {
    const recordingPath = resolve(videosDir, 'public/recordings', config.recording_file);
    if (!existsSync(recordingPath)) {
      return NextResponse.json(
        { error: `Recording not found: ${config.recording_file}. Place it in videos/public/recordings/` },
        { status: 400 }
      );
    }
  }

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
    muted: !!config.muted,
  };
  const propsFile = resolve(propsDir, `${compositionId}.json`);
  writeFileSync(propsFile, JSON.stringify(props, null, 2));

  // Build command
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
      ...(config.muted ? ['--muted'] : []),
    ];
  }

  // Stream output as newline-delimited JSON
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (type: string, text: string) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type, text }) + '\n'));
        } catch {
          // Stream already closed
        }
      };

      send('status', `$ ${command} ${args.join(' ')}`);
      send('status', `cwd: ${videosDir}`);

      try {
        const child = spawn(command, args, {
          cwd: videosDir,
          env: { ...process.env, FORCE_COLOR: '0' },
          shell: true,
        });

        child.stdout?.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) send('stdout', line);
        });

        child.stderr?.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) send('stderr', line);
        });

        child.on('close', (code: number | null) => {
          if (code === 0) {
            send('done', action === 'preview'
              ? 'Remotion Studio started'
              : `Rendered: videos/out/${outFile}.mp4`
            );
          } else {
            send('error', `Process exited with code ${code}`);
          }
          controller.close();
        });

        child.on('error', (err: Error) => {
          send('error', `Failed to start: ${err.message}`);
          controller.close();
        });
      } catch (err) {
        send('error', `Spawn failed: ${err instanceof Error ? err.message : String(err)}`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
