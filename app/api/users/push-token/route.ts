import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { checkRateLimit } from '@/lib/rate-limit/check';

// POST /api/users/push-token
// Called by native app on each launch to register/refresh the Expo push token.
// Upserts push_token + push_platform on the users row.
export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = await checkRateLimit({ key: `push-token:${clerkId}`, limit: 10, windowSeconds: 60 });
  if (!limit.ok) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
  }

  const body = await request.json();
  const { push_token, push_platform } = body as {
    push_token?: string;
    push_platform?: string;
  };

  if (!push_token || !['ios', 'android'].includes(push_platform ?? '')) {
    return NextResponse.json(
      { error: 'push_token and push_platform (ios|android) required' },
      { status: 400 }
    );
  }

  await sql`
    UPDATE users
    SET push_token = ${push_token}, push_platform = ${push_platform!}, updated_at = NOW()
    WHERE clerk_id = ${clerkId}
  `;

  return NextResponse.json({ ok: true });
}
