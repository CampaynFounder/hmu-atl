import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import sql from '../../../../../../../lib/db/client';
import { redis } from '../../../../../../../lib/notifications/redis';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix: 'rl:admin:accounts:suspend',
});

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { success } = await ratelimit.limit(userId);
  if (!success) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.publicMetadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rejection = await requireAdmin(req);
  if (rejection) return rejection;

  const { id: userId } = await params;

  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { reason } = body;
  if (!reason || typeof reason !== 'string') {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  try {
    const result = await sql`
      UPDATE users
      SET
        account_status = 'suspended',
        updated_at     = NOW()
      WHERE id = ${userId}
        AND account_status != 'banned'
      RETURNING id, account_status
    `;

    if (!result[0]) {
      return NextResponse.json({ error: 'User not found or account is banned' }, { status: 404 });
    }

    // Log suspension reason to notifications table for audit trail
    await sql`
      INSERT INTO notifications (user_id, type, payload, sent_at)
      VALUES (
        ${userId},
        'account_suspended',
        ${JSON.stringify({ reason })}::jsonb,
        NOW()
      )
    `;

    return NextResponse.json({ ok: true, user_id: userId, account_status: 'suspended', reason });
  } catch (err) {
    console.error('[admin/accounts/suspend] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
