'use client';

import { createContext, useContext } from 'react';

export interface AdminAuthData {
  id: string;
  roleSlug: string | null;
  permissions: string[];
  isSuper: boolean;
  requiresPublishApproval: boolean;
  // Set when a super admin is previewing the portal as a lower role. The
  // permissions/roleSlug above already reflect the previewed role; these
  // fields exist so the UI can show a banner and offer an exit affordance.
  isPreview?: boolean;
  realRoleSlug?: string | null;
  previewRoleLabel?: string | null;
  // True if the underlying user is a super admin (regardless of preview).
  // Used to decide whether to show "Preview as" affordances on the roles
  // page even while a preview is active.
  realIsSuper?: boolean;
}

interface AdminAuthContextValue {
  admin: AdminAuthData | null;
  hasPermission: (permission: string) => boolean;
  canView: (section: string) => boolean;
  canEdit: (section: string) => boolean;
  canPublish: (section: string) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue>({
  admin: null,
  hasPermission: () => true,
  canView: () => true,
  canEdit: () => true,
  canPublish: () => true,
});

export function AdminAuthProvider({
  admin,
  children,
}: {
  admin: AdminAuthData;
  children: React.ReactNode;
}) {
  const hasPerm = (permission: string) => {
    if (!admin) return false;
    if (admin.isSuper) return true;
    if (admin.permissions.includes(permission)) return true;
    // Hierarchical: edit implies view, publish implies edit+view
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
  };

  return (
    <AdminAuthContext.Provider value={{
      admin,
      hasPermission: hasPerm,
      canView: (section: string) => hasPerm(`${section}.view`),
      canEdit: (section: string) => hasPerm(`${section}.edit`),
      canPublish: (section: string) => hasPerm(`${section}.publish`),
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}
