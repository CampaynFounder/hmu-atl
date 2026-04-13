import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit/check';

const ACCESS_CODE = process.env.DATA_ROOM_ACCESS_CODE || 'atlhmu82';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';

    const rl = await checkRateLimit({
      key: `data-room:verify:${ip}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      );
    }

    const { code } = await request.json();

    if (!code || code.toLowerCase() !== ACCESS_CODE.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
    }

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
