import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit/check';
import { getDataRoomAccessCode } from '@/lib/data-room/access-code';

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
    const accessCode = await getDataRoomAccessCode();

    if (!code || code.toLowerCase() !== accessCode.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
    }

    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
