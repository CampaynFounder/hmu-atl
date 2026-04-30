// Preview-as-role: lets a super admin temporarily view the admin portal as if
// they had a lower role's permissions, to verify what that role can see/do
// before granting it to another user. Gated to is_super = true on the REAL
// identity. Mutations are blocked at the middleware layer while previewing.

import { cookies } from 'next/headers';
import { sql } from '@/lib/db/client';
import type { AdminUser } from './helpers';

export const PREVIEW_COOKIE_NAME = 'admin_preview_role_id';
// Short lifetime — preview is meant for spot-checks, not extended use. The
// super admin can re-enter preview anytime via /admin/roles.
export const PREVIEW_COOKIE_MAX_AGE_S = 60 * 60 * 2;

export interface PreviewedRole {
  id: string;
  slug: string;
  label: string;
  permissions: string[];
}

async function loadRole(roleId: string): Promise<PreviewedRole | null> {
  const rows = await sql`
    SELECT id, slug, label, permissions, is_super
    FROM admin_roles
    WHERE id = ${roleId}
    LIMIT 1
  `;
  if (!rows.length) return null;
  // Previewing as another super_admin would just be the same as your real
  // identity — nothing to verify, and we don't want to obscure the source of
  // truth. Refuse it.
  if (rows[0].is_super) return null;
  return {
    id: rows[0].id as string,
    slug: rows[0].slug as string,
    label: rows[0].label as string,
    permissions: (rows[0].permissions as string[]) || [],
  };
}

export interface EffectiveAdmin {
  effective: AdminUser;
  isPreview: boolean;
  realRoleSlug: string | null;
  previewRole: PreviewedRole | null;
}

/**
 * Apply the preview-role swap if the cookie is set AND the real admin is super.
 * Returns the admin identity that subsequent permission checks should use.
 *
 * If the cookie references a missing or super role, falls through to the real
 * identity (defensive — a stale cookie shouldn't lock the super admin out).
 */
export async function applyPreviewSwap(realAdmin: AdminUser): Promise<EffectiveAdmin> {
  const noPreview: EffectiveAdmin = {
    effective: realAdmin,
    isPreview: false,
    realRoleSlug: realAdmin.role_slug,
    previewRole: null,
  };

  if (!realAdmin.is_super) return noPreview;

  const store = await cookies();
  const roleId = store.get(PREVIEW_COOKIE_NAME)?.value;
  if (!roleId) return noPreview;

  const role = await loadRole(roleId);
  if (!role) return noPreview;

  return {
    effective: {
      ...realAdmin,
      role_slug: role.slug,
      permissions: role.permissions,
      is_super: false,
      isPreview: true,
      realRoleSlug: realAdmin.role_slug,
    },
    isPreview: true,
    realRoleSlug: realAdmin.role_slug,
    previewRole: role,
  };
}
