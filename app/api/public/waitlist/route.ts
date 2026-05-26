import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { phone, city, marketSlug } = body as Record<string, string | null | undefined>;

  if (!phone || typeof phone !== 'string') {
    return NextResponse.json({ error: 'Phone required' }, { status: 400 });
  }

  // Normalize: digits only, must be 10–15 chars
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 });
  }
  const normalized = digits.startsWith('1') && digits.length === 11
    ? `+${digits}`
    : `+1${digits}`;

  await sql`
    INSERT INTO market_waitlist (phone, city, market_slug, source)
    VALUES (${normalized}, ${city ?? null}, ${marketSlug ?? null}, 'apex_waitlist')
    ON CONFLICT (phone) DO NOTHING
  `;

  return NextResponse.json({ ok: true });
}
