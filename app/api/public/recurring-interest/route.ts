import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';

// Email capture for the "Coming Soon" recurring-rides toggle in the booking
// drawer. Pre-launch demand list — we email when recurring ships. Public so
// the drawer captures both anon and authed users in one shot.

const RATE_LIMIT_PER_HOUR = 10;

function clientIp(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    intendedFrequency?: string | null;
    intendedDays?: number[] | null;
    source?: string;
    driverHandle?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const limit = await checkRateLimit({
    key: `recurring_interest:${clientIp(req)}`,
    limit: RATE_LIMIT_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many submissions. Try again in a bit.', retryAfter: limit.retryAfterSeconds },
      { status: 429 },
    );
  }

  const { userId: clerkId } = await auth();
  let userId: string | null = null;
  if (clerkId) {
    const userRows = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId} LIMIT 1`;
    userId = (userRows[0] as { id: string } | undefined)?.id || null;
  }

  const intendedFrequency = body.intendedFrequency
    && ['daily', 'weekly'].includes(body.intendedFrequency)
    ? body.intendedFrequency
    : null;

  const intendedDays = Array.isArray(body.intendedDays)
    ? body.intendedDays.filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    : null;

  const source = (body.source || 'browse_drawer').slice(0, 50);

  await sql`
    INSERT INTO recurring_interest (email, intended_frequency, intended_days, source, user_id)
    VALUES (${email}, ${intendedFrequency}, ${intendedDays}, ${source}, ${userId})
  `;

  return NextResponse.json({ ok: true }, { status: 201 });
}
