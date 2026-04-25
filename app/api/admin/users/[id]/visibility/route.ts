// PATCH /api/admin/users/[id]/visibility
// Toggles the user's profile_visible flag. Driver row writes to
// driver_profiles.profile_visible (already wired into /rider/browse + the BRB
// share page). Rider row writes to rider_profiles.profile_visible
// (filters /driver/find-riders + the HMU/Link masked rider directory).
//
// Body: { visible: boolean }
// Returns: { id, profileType, profileVisible }

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import {
  requireAdmin,
  hasPermission,
  unauthorizedResponse,
  logAdminAction,
} from '@/lib/admin/helpers';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  // Reuse the existing user-edit permission. Super admins bypass.
  if (!hasPermission(admin, 'act.users.edit')) return unauthorizedResponse();

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { visible?: unknown };
  const visible = body.visible;
  if (typeof visible !== 'boolean') {
    return NextResponse.json({ error: 'visible must be a boolean' }, { status: 400 });
  }

  const userRows = await sql`
    SELECT id, profile_type FROM users WHERE id = ${id} LIMIT 1
  `;
  if (!userRows.length) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const profileType = (userRows[0] as { profile_type: string }).profile_type;

  if (profileType === 'driver') {
    const r = await sql`
      UPDATE driver_profiles
      SET profile_visible = ${visible}, updated_at = NOW()
      WHERE user_id = ${id}
      RETURNING profile_visible
    `;
    if (!r.length) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
  } else if (profileType === 'rider') {
    const r = await sql`
      UPDATE rider_profiles
      SET profile_visible = ${visible}
      WHERE user_id = ${id}
      RETURNING profile_visible
    `;
    if (!r.length) return NextResponse.json({ error: 'Rider profile not found' }, { status: 404 });
  } else {
    return NextResponse.json(
      { error: `Cannot toggle visibility for profile_type='${profileType}'` },
      { status: 400 },
    );
  }

  await logAdminAction(
    admin.id,
    'user_visibility_toggle',
    'users',
    id,
    { profileType, visible },
  );

  return NextResponse.json({ id, profileType, profileVisible: visible });
}
