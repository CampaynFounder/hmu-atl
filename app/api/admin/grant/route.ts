// POST /api/admin/grant — Grant or revoke admin access for a user
// Only existing admins can use this
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();

  const { userId, grant } = await req.json() as { userId: string; grant: boolean };

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const rows = await sql`
    UPDATE users SET is_admin = ${grant}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, profile_type, is_admin
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await logAdminAction(admin.id, grant ? 'grant_admin' : 'revoke_admin', 'user', userId, {});

  return NextResponse.json({ success: true, user: rows[0] });
}
