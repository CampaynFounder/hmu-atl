import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, hasPermission, logAdminAction } from '@/lib/admin/helpers';

// POST: Assign a role to a user (and grant admin if not already)
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.roles')) return unauthorizedResponse();

  const body = await request.json();
  const { user_id, role_id } = body;

  if (!user_id || !role_id) {
    return NextResponse.json({ error: 'user_id and role_id required' }, { status: 400 });
  }

  // Assign role + ensure is_admin = true
  const rows = await sql`
    UPDATE users
    SET admin_role_id = ${role_id}, is_admin = true, updated_at = NOW()
    WHERE id = ${user_id}
    RETURNING id, clerk_id
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await logAdminAction(admin.id, 'role_assigned', 'user', user_id, { role_id });

  return NextResponse.json({ ok: true });
}
