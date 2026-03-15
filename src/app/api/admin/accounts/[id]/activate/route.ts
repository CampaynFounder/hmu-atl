import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { adminRatelimit } from '@/lib/admin/ratelimit';
import { logAdminAction } from '@/lib/admin/log';
import sql from '@/lib/admin/db';

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

  // id is user_id
  const [user] = await sql`
    SELECT u.id, dp.id AS driver_profile_id, dp.background_check_status
    FROM users u
    JOIN driver_profiles dp ON dp.user_id = u.id
    WHERE u.id = ${id}
    LIMIT 1
  `;

  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  if (user.background_check_status === 'approved') {
    return NextResponse.json({ error: 'Account already active' }, { status: 409 });
  }

  await sql.transaction(async (tx) => {
    await tx`
      UPDATE driver_profiles
      SET background_check_status = 'approved',
          background_check_date   = NOW(),
          updated_at              = NOW()
      WHERE user_id = ${id}
    `;

    await tx`
      UPDATE users
      SET is_verified = true,
          updated_at  = NOW()
      WHERE id = ${id}
    `;
  });

  await logAdminAction(auth.userId, 'activate_account', 'user', id);

  return NextResponse.json({ success: true, user_id: id });
}
