import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { AdminSidebar } from './components/admin-sidebar';
import { AdminMain } from './components/admin-main';
import { MarketProvider } from './components/market-context';
import { SidebarProvider } from './components/sidebar-context';
import { AdminThemeProvider } from './components/theme-context';
import { AdminAuthProvider } from './components/admin-auth-context';
import { SessionTimeout } from './components/session-timeout';

export const metadata = {
  title: 'HMU Admin',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkUser = await currentUser();

  if (!clerkUser) redirect('/admin/login');

  // Check is_admin flag + load role/permissions
  const rows = await sql`
    SELECT u.id, u.is_admin, ar.slug as role_slug, ar.permissions, ar.is_super, ar.requires_publish_approval
    FROM users u
    LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
    WHERE u.clerk_id = ${clerkUser.id} LIMIT 1
  `;
  if (!rows.length || !rows[0].is_admin) redirect('/');

  const row = rows[0];
  const adminData = {
    id: row.id as string,
    roleSlug: (row.role_slug as string) || null,
    permissions: (row.permissions as string[]) || [],
    isSuper: (row.is_super as boolean) || false,
    requiresPublishApproval: (row.requires_publish_approval as boolean) || false,
  };

  return (
    <AdminAuthProvider admin={adminData}>
      <MarketProvider>
        <SidebarProvider>
          <AdminThemeProvider>
            <div className="min-h-screen flex" style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)' }}>
              <AdminSidebar />
              <AdminMain>{children}</AdminMain>
              <SessionTimeout />
            </div>
          </AdminThemeProvider>
        </SidebarProvider>
      </MarketProvider>
    </AdminAuthProvider>
  );
}
