'use client';

import { createContext, useContext } from 'react';

export interface AdminAuthData {
  id: string;
  roleSlug: string | null;
  permissions: string[];
  isSuper: boolean;
  requiresPublishApproval: boolean;
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
