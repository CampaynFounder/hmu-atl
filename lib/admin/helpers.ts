// Admin helpers — auth guard, permissions, and audit logging

import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { NextResponse } from 'next/server';
import { applyPreviewSwap } from './preview-role';

export interface AdminUser {
  id: string;
  clerk_id: string;
  profile_type: string;
  role_slug: string | null;
  /** Resolved role id. In preview mode, the previewed role's id (not the user's real role). */
  admin_role_id: string | null;
  permissions: string[];
  is_super: boolean;
  // Markets this admin is allowed to access. NULL = unrestricted (super
  // behavior); set array = explicit allowlist; empty array = no markets.
  // Super admins ignore this field entirely.
  admin_market_ids: string[] | null;
  // Set when a super admin is previewing as a lower role. Permission checks
  // and the is_super bypass already follow the swapped values; this flag is
  // purely informational (banners, audit context).
  isPreview?: boolean;
  realRoleSlug?: string | null;
}

/**
 * Verify the current user is an admin. Returns admin user with role/permissions or null.
 *
 * If the caller is a super admin AND the preview-role cookie is set, the
 * returned identity is swapped to the previewed role's permissions so every
 * downstream permission check (sidebar, search, route guards) reflects what
 * that role would actually see and do. The real super-admin identity is still
 * exposed via `realRoleSlug` and `isPreview`.
 */
export async function requireAdmin(): Promise<AdminUser | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const rows = await sql`
    SELECT u.id, u.clerk_id, u.profile_type, u.admin_market_ids, u.admin_role_id,
           ar.slug as role_slug, ar.permissions, ar.is_super
    FROM users u
    LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
    WHERE u.clerk_id = ${clerkId} AND u.is_admin = true
    LIMIT 1
  `;
  if (!rows.length) return null;

  const row = rows[0];
  const real: AdminUser = {
    id: row.id as string,
    clerk_id: row.clerk_id as string,
    profile_type: row.profile_type as string,
    role_slug: (row.role_slug as string) || null,
    admin_role_id: (row.admin_role_id as string | null) ?? null,
    permissions: (row.permissions as string[]) || [],
    is_super: (row.is_super as boolean) || false,
    admin_market_ids: (row.admin_market_ids as string[]) ?? null,
  };

  const { effective } = await applyPreviewSwap(real);
  return effective;
}

/**
 * Like requireAdmin, but always returns the real (non-swapped) identity. Use
 * this for endpoints that must operate on the actual user — currently only
 * /api/admin/preview-role itself, which needs to verify is_super on the real
 * identity even while a preview cookie is set.
 */
export async function requireRealAdmin(): Promise<AdminUser | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const rows = await sql`
    SELECT u.id, u.clerk_id, u.profile_type, u.admin_market_ids, u.admin_role_id,
           ar.slug as role_slug, ar.permissions, ar.is_super
    FROM users u
    LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
    WHERE u.clerk_id = ${clerkId} AND u.is_admin = true
    LIMIT 1
  `;
  if (!rows.length) return null;

  const row = rows[0];
  return {
    id: row.id as string,
    clerk_id: row.clerk_id as string,
    profile_type: row.profile_type as string,
    role_slug: (row.role_slug as string) || null,
    admin_role_id: (row.admin_role_id as string | null) ?? null,
    permissions: (row.permissions as string[]) || [],
    is_super: (row.is_super as boolean) || false,
    admin_market_ids: (row.admin_market_ids as string[]) ?? null,
  };
}

/**
 * Check if an admin has a specific permission. Super admins always pass.
 * Supports hierarchical levels: publish implies edit, edit implies view.
 * e.g. hasPermission(admin, 'grow.funnel.view') returns true if they have .edit or .publish
 */
export function hasPermission(admin: AdminUser, permission: string): boolean {
  if (admin.is_super) return true;
  if (admin.permissions.includes(permission)) return true;

  // Hierarchical check: extract section + level
  const lastDot = permission.lastIndexOf('.');
  if (lastDot === -1) return false;
  const section = permission.substring(0, lastDot);
  const level = permission.substring(lastDot + 1);

  if (level === 'view') {
    return admin.permissions.includes(`${section}.edit`) || admin.permissions.includes(`${section}.publish`);
  }
  if (level === 'edit') {
    return admin.permissions.includes(`${section}.publish`);
  }
  return false;
}

/**
 * Return 403 if admin lacks the required permission.
 */
export function checkPermission(admin: AdminUser, permission: string): boolean {
  return hasPermission(admin, permission);
}

/**
 * Return 403 response if not admin
 */
export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}

/**
 * Log an admin action to the audit trail
 */
export async function logAdminAction(
  adminId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await sql`
    INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
    VALUES (${adminId}, ${action}, ${targetType ?? null}, ${targetId ?? null}, ${JSON.stringify(details ?? {})})
  `;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
