import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';

// Public — no auth. Anon riders submit the booking drawer's payload here so
// it survives the Clerk sign-up/sign-in round-trip; /auth-callback consumes
// the draft post-auth and forwards it to /api/drivers/[handle]/book.
//
// Limits: 5 drafts/IP/hr (matches authed booking cap), 15-min TTL on the row.

const RATE_LIMIT_PER_HOUR = 5;
const MAX_PRICE = 1000;

async function ipHash(req: NextRequest): Promise<string> {
  const ip = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const ua = req.headers.get('user-agent') || '';
  const enc = new TextEncoder().encode(`${ip}|${ua}`);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function POST(req: NextRequest) {
  let body: {
    handle?: string;
    price?: number;
    timeWindow?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const handle = (body.handle || '').trim().toLowerCase();
  const price = Number(body.price);
  const tw = body.timeWindow || {};

  if (!handle || !/^[a-z0-9_-]{1,32}$/.test(handle)) {
    return NextResponse.json({ error: 'Invalid driver handle' }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 1 || price > MAX_PRICE) {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
  }
  const dest = typeof tw.destination === 'string' ? tw.destination.trim() : '';
  if (!dest) {
    return NextResponse.json({ error: 'Where you going?' }, { status: 400 });
  }

  // Per-IP rate limit so the public endpoint can't be sprayed.
  const limit = await checkRateLimit({
    key: `public_draft:${clientIp(req)}`,
    limit: RATE_LIMIT_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many drafts. Try again in a bit.', retryAfter: limit.retryAfterSeconds },
      { status: 429 },
    );
  }

  // Confirm the driver exists so we don't park drafts pointing at nothing.
  const driverRows = await sql`
    SELECT user_id FROM driver_profiles WHERE handle = ${handle} LIMIT 1
  `;
  if (!driverRows.length) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  }

  const hash = await ipHash(req);

  // Digital-only in this funnel — we hard-code is_cash=false on consume.
  const payload = {
    price,
    isCash: false,
    timeWindow: {
      destination: dest,
      time: typeof tw.time === 'string' ? tw.time.trim() : '',
      message: typeof tw.message === 'string' ? tw.message.trim() : '',
    },
  };

  const rows = await sql`
    INSERT INTO public_draft_bookings (handle, payload, ip_hash)
    VALUES (${handle}, ${JSON.stringify(payload)}, ${hash})
    RETURNING id, expires_at
  `;
  const row = rows[0] as { id: string; expires_at: string };

  return NextResponse.json({
    draftId: row.id,
    expiresAt: row.expires_at,
  }, { status: 201 });
}
