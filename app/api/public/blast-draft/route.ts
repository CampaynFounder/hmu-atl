import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';

// Public — no auth. Blast form saves the draft here before the Clerk sign-up
// round-trip. /auth-callback/blast fetches it back when localStorage is empty
// (happens when an in-app browser user copies the link and opens Safari/Chrome).
//
// Limits: 5 saves/IP/hr, 45-min TTL on the row (longer than the 30-min
// localStorage TTL to account for sign-up friction).

const RATE_LIMIT_PER_HOUR = 5;

function clientIp(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

async function ipHash(req: NextRequest): Promise<string> {
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent') || '';
  const enc = new TextEncoder().encode(`${ip}|${ua}`);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isValidDraftShape(d: unknown): boolean {
  if (!d || typeof d !== 'object') return false;
  const draft = d as Record<string, unknown>;
  const checkPoint = (p: unknown): boolean => {
    if (!p || typeof p !== 'object') return false;
    const pp = p as Record<string, unknown>;
    return typeof pp.lat === 'number' && Number.isFinite(pp.lat)
      && typeof pp.lng === 'number' && Number.isFinite(pp.lng)
      && typeof pp.address === 'string';
  };
  return (
    checkPoint(draft.pickup) &&
    checkPoint(draft.dropoff) &&
    (draft.tripType === 'one_way' || draft.tripType === 'round_trip') &&
    typeof draft.storage === 'boolean' &&
    typeof draft.priceDollars === 'number' && Number.isFinite(draft.priceDollars) &&
    typeof draft.draftCreatedAt === 'number'
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isValidDraftShape(body)) {
    return NextResponse.json({ error: 'Invalid draft shape' }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `public_blast_draft:${clientIp(req)}`,
    limit: RATE_LIMIT_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many drafts. Try again in a bit.', retryAfter: limit.retryAfterSeconds },
      { status: 429 },
    );
  }

  const hash = await ipHash(req);
  const rows = await sql`
    INSERT INTO public_blast_drafts (draft_data, ip_hash)
    VALUES (${JSON.stringify(body)}, ${hash})
    RETURNING id, expires_at
  `;
  const row = rows[0] as { id: string; expires_at: string };

  return NextResponse.json({ draftId: row.id, expiresAt: row.expires_at }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });
  }

  const rows = await sql`
    SELECT draft_data, expires_at
    FROM public_blast_drafts
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const row = rows[0] as { draft_data: unknown; expires_at: string };
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Draft expired' }, { status: 410 });
  }

  return NextResponse.json(row.draft_data);
}
