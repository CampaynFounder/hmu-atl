import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db/client';
import { AdminSidebar } from './components/admin-sidebar';
import { AdminMain } from './components/admin-main';
import { MarketProvider } from './components/market-context';
import { SidebarProvider } from './components/sidebar-context';
import { AdminThemeProvider } from './components/theme-context';
import { AdminAuthProvider } from './components/admin-auth-context';
import { SessionTimeout } from './components/session-timeout';
import { RealtimeNotificationBanner } from './components/realtime-notification-banner';
import { PreviewBanner } from './components/preview-banner';
import { applyPreviewSwap } from '@/lib/admin/preview-role';
import { canAccess } from '@/lib/admin/route-permissions';
import { hasPermission, type AdminUser } from '@/lib/admin/helpers';

export const metadata = {
  title: 'HMU Admin',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clerkUser = await currentUser();

  if (!clerkUser) redirect('/admin-login');

  // Check is_admin flag + load real role/permissions
  const rows = await sql`
    SELECT u.id, u.clerk_id, u.profile_type, u.is_admin, u.admin_market_ids,
           ar.slug as role_slug, ar.label as role_label, ar.permissions, ar.is_super, ar.requires_publish_approval
    FROM users u
    LEFT JOIN admin_roles ar ON ar.id = u.admin_role_id
    WHERE u.clerk_id = ${clerkUser.id} LIMIT 1
  `;
  if (!rows.length || !rows[0].is_admin) redirect('/');

  const row = rows[0];
  const realAdmin: AdminUser = {
    id: row.id as string,
    clerk_id: row.clerk_id as string,
    profile_type: row.profile_type as string,
    role_slug: (row.role_slug as string) || null,
    permissions: (row.permissions as string[]) || [],
    is_super: (row.is_super as boolean) || false,
    admin_market_ids: (row.admin_market_ids as string[]) ?? null,
  };
  const realRoleLabel = (row.role_label as string) || null;
  const requiresPublishApproval = (row.requires_publish_approval as boolean) || false;

  // If a super admin has set the preview cookie, swap to that role's
  // permissions everywhere. Sidebar, search palette, and any client-side
  // permission check then reflect what the previewed role would see.
  const swap = await applyPreviewSwap(realAdmin);
  const effectiveRoleLabel = swap.previewRole?.label ?? realRoleLabel;

  // Server-side route guard. Pathname comes from `x-admin-pathname` set in
  // middleware. Unmapped routes default-deny (only super reaches them) inside
  // `canAccess`. Any non-super admin who lands on a route they don't have
  // permission for — by typing the URL, bookmark, stale link — bounces back
  // to /admin, where `app/admin/page.tsx` redirects them to the first nav
  // route their role can access (or shows an empty state if none).
  //
  // /admin itself is exempt from the guard: its rule is `super`, but every
  // admin needs a landing page to dispatch from. The page-level component is
  // permission-aware and renders LiveOpsDashboard for super only.
  const requestHeaders = await headers();
  const adminPathname = requestHeaders.get('x-admin-pathname');
  if (
    adminPathname
    && adminPathname !== '/admin'
    && !canAccess(adminPathname, swap.effective.is_super, (p) => hasPermission(swap.effective, p))
  ) {
    redirect('/admin');
  }

  const adminData = {
    id: realAdmin.id,
    roleSlug: swap.effective.role_slug,
    roleLabel: effectiveRoleLabel,
    permissions: swap.effective.permissions,
    isSuper: swap.effective.is_super,
    requiresPublishApproval,
    isPreview: swap.isPreview,
    realRoleSlug: swap.realRoleSlug,
    realRoleLabel,
    previewRoleLabel: swap.previewRole?.label ?? null,
    realIsSuper: realAdmin.is_super,
  };

  return (
    <AdminAuthProvider admin={adminData}>
      <MarketProvider>
        <SidebarProvider>
          <AdminThemeProvider>
            {/* PreviewBanner is position:fixed and AdminSidebar / AdminMain
                each shift their own offsets when admin.isPreview is set, so
                the wrapper itself stays unchanged. */}
            <div className="min-h-screen flex" style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)' }}>
              <PreviewBanner />
              <AdminSidebar />
              <AdminMain>{children}</AdminMain>
              <SessionTimeout />
              <RealtimeNotificationBanner />
            </div>
          </AdminThemeProvider>
        </SidebarProvider>
      </MarketProvider>
    </AdminAuthProvider>
  );
}
