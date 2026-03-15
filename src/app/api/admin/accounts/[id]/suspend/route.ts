import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import { logAdminAction } from '@/lib/admin/log';
import sql from '@/lib/admin/db';

interface SuspendBody {
  reason: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { success } = await adminRatelimit.limit(auth.userId);
  if (!success) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { id } = await params;

  let body: SuspendBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { reason } = body;
  if (!reason?.trim()) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });
  }

  const [user] = await sql`
    SELECT id, is_active FROM users WHERE id = ${id} LIMIT 1
  `;

  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  if (!user.is_active) {
    return NextResponse.json({ error: 'Account already suspended' }, { status: 409 });
  }

  await sql`
    UPDATE users
    SET is_active  = false,
        updated_at = NOW()
    WHERE id = ${id}
  `;

  await logAdminAction(auth.userId, 'suspend_account', 'user', id, { reason });

  return NextResponse.json({ success: true, user_id: id });
}
