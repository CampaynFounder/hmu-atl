import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { requireAdmin, unauthorizedResponse, hasPermission, logAdminAction } from '@/lib/admin/helpers';

// GET: List all roles with admin counts
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.roles')) return unauthorizedResponse();

  const roles = await sql`
    SELECT ar.*, COUNT(u.id) as admin_count
    FROM admin_roles ar
    LEFT JOIN users u ON u.admin_role_id = ar.id AND u.is_admin = true
    GROUP BY ar.id
    ORDER BY ar.is_super DESC, ar.slug ASC
  `;

  // Also get list of current admins with their roles + market scope
  const admins = await sql`
    SELECT u.id, u.clerk_id, u.profile_type, u.admin_market_ids,
           dp.display_name as driver_name, rp.display_name as rider_name,
           dp.email as driver_email, rp.phone as rider_phone,
           ar.slug as role_slug, ar.label as role_label, ar.is_super
    FROM users u
    LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    WHERE u.is_admin = true
    ORDER BY ar.is_super DESC, u.created_at ASC
  `;

  return NextResponse.json({ roles, admins });
}

// POST: Create a new role
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.roles')) return unauthorizedResponse();

  const body = await request.json();
  const { slug, label, description, permissions, requires_publish_approval } = body;

  if (!slug || !label) {
    return NextResponse.json({ error: 'slug and label required' }, { status: 400 });
  }

  const permsArray = Array.isArray(permissions) && permissions.length > 0 ? permissions : [];
  // Neon sql template needs Postgres array literal for TEXT[]
  const permsLiteral = `{${permsArray.map((p: string) => `"${p}"`).join(',')}}`;

  try {
    const rows = await sql`
      INSERT INTO admin_roles (slug, label, description, permissions, requires_publish_approval)
      VALUES (${slug}, ${label}, ${description || null}, ${permsLiteral}::TEXT[], ${requires_publish_approval || false})
      RETURNING id
    `;

    await logAdminAction(admin.id, 'role_created', 'admin_role', rows[0].id as string, { slug, label, permissions });

    return NextResponse.json({ id: rows[0].id });
  } catch (error) {
    console.error('Failed to create role:', error);
    return NextResponse.json({ error: 'Failed to create role', details: String(error) }, { status: 500 });
  }
}

// PATCH: Update a role
//
// Body fields are all optional EXCEPT id; only the fields that are present
// (not undefined) are updated. Pass `permissions: []` to clear all
// permissions; omit the field to leave them untouched.
//
// Super roles cannot be edited — the WHERE clause silently no-ops them
// rather than returning an error, matching the DELETE endpoint's behavior.
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.roles')) return unauthorizedResponse();

  const body = await request.json();
  const { id, label, description, permissions, requires_publish_approval } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Convert JS string[] to a Postgres TEXT[] literal — Neon's tagged template
  // doesn't auto-marshal arrays into TEXT[]. `null` means "leave alone";
  // anything else (including an empty array) is an explicit overwrite.
  const permsLiteral = Array.isArray(permissions)
    ? `{${permissions.map((p: string) => `"${p}"`).join(',')}}`
    : null;

  await sql`
    UPDATE admin_roles
    SET label = COALESCE(${label || null}, label),
        description = COALESCE(${description ?? null}, description),
        permissions = COALESCE(${permsLiteral}::TEXT[], permissions),
        requires_publish_approval = COALESCE(${typeof requires_publish_approval === 'boolean' ? requires_publish_approval : null}, requires_publish_approval)
    WHERE id = ${id} AND is_super = false
  `;

  await logAdminAction(admin.id, 'role_updated', 'admin_role', id, {
    label, description, permissions, requires_publish_approval,
  });

  return NextResponse.json({ ok: true });
}

// DELETE: Delete a non-super role
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!hasPermission(admin, 'admin.roles')) return unauthorizedResponse();

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Unassign users from this role first
  await sql`UPDATE users SET admin_role_id = NULL WHERE admin_role_id = ${id}`;
  await sql`DELETE FROM admin_roles WHERE id = ${id} AND is_super = false`;

  await logAdminAction(admin.id, 'role_deleted', 'admin_role', id);

  return NextResponse.json({ ok: true });
}
