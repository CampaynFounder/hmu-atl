import { redirect } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { ADMIN_ROUTES, canAccess } from '@/lib/admin/route-permissions';
import { LiveOpsDashboard } from './components/live-ops-dashboard';

export default async function AdminPage() {
  // Live Ops is super-admin only. Layout already enforced is_admin; this is
  // the second gate so a direct URL hit can't bypass the sidebar filter.
  // requireAdmin applies the preview-role swap, so a super previewing a lower
  // role correctly gets routed like that role would.
  const admin = await requireAdmin();
  if (!admin) redirect('/');
  if (admin.is_super) return <LiveOpsDashboard />;

  // Non-super: send them to the first nav route they can access (declaration
  // order in ADMIN_ROUTES mirrors the sidebar). Hardcoding /admin/support
  // here is what caused the redirect loop with the new layout-level guard
  // when a role didn't have act.support.view.
  for (const entry of ADMIN_ROUTES) {
    if (entry.pattern === '/admin') continue;
    if (canAccess(entry.pattern, false, (p) => hasPermission(admin, p))) {
      redirect(entry.pattern);
    }
  }

  // No accessible routes — show an empty state instead of looping. Reachable
  // only if a role exists with zero view permissions, which shouldn't happen
  // in practice but is the right thing to render if it does.
  return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--admin-text-muted)' }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 8 }}>
        No admin access yet
      </div>
      <div style={{ fontSize: 13 }}>
        Your role doesn&apos;t have any view permissions. Ask a super admin to grant access at <code>/admin/roles</code>.
      </div>
    </div>
  );
}
