// POST   /api/admin/preview-role   { role_id }  — enter preview mode
// DELETE /api/admin/preview-role                — exit preview mode
//
// Both endpoints require is_super on the REAL identity (not the swapped one),
// so requireRealAdmin is used. The DELETE endpoint is allowlisted in
// middleware so it works even while the preview cookie is set (otherwise the
// super admin couldn't exit).

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireRealAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { PREVIEW_COOKIE_NAME, PREVIEW_COOKIE_MAX_AGE_S } from '@/lib/admin/preview-role';

export async function POST(req: NextRequest) {
  const realAdmin = await requireRealAdmin();
  if (!realAdmin) return unauthorizedResponse();
  if (!realAdmin.is_super) return unauthorizedResponse();

  const body = await req.json().catch(() => ({}));
  const roleId = (body.role_id as string) || '';
  if (!roleId) return NextResponse.json({ error: 'role_id required' }, { status: 400 });

  const rows = await sql`
    SELECT id, slug, label, is_super FROM admin_roles WHERE id = ${roleId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ error: 'role not found' }, { status: 404 });
  if (rows[0].is_super) {
    return NextResponse.json({ error: 'cannot preview as a super role' }, { status: 400 });
  }

  await logAdminAction(realAdmin.id, 'preview_role_enter', 'admin_role', roleId, {
    role_slug: rows[0].slug,
  });

  const res = NextResponse.json({ ok: true, role_slug: rows[0].slug, role_label: rows[0].label });
  res.cookies.set(PREVIEW_COOKIE_NAME, roleId, {
    maxAge: PREVIEW_COOKIE_MAX_AGE_S,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const realAdmin = await requireRealAdmin();
  if (!realAdmin) return unauthorizedResponse();
  // Exiting preview is permitted for any admin (defensive — if a non-super
  // somehow has the cookie, they should be able to clear it). Only super
  // admins can re-enter.
  await logAdminAction(realAdmin.id, 'preview_role_exit');

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PREVIEW_COOKIE_NAME, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  return res;
}
