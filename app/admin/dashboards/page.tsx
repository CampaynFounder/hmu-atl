// /admin/dashboards — viewer landing.
//
// Lists the dashboards the current admin is allowed to see (granted via
// admin_dashboard_role_grants, plus always-visible builtins). Pick a
// dashboard + a user → navigates to /admin/users/[id]?dashboard=<slug>,
// which renders the actual configured dashboard.
//
// Editors (super or admin.dashboards.edit) see a "Manage" link in the top
// right. Builder lives at /admin/dashboards/manage.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { listAccessibleDashboards } from '@/lib/admin/dashboards/runtime';
import { ensureBuiltinsReconciled } from '@/lib/admin/dashboards/builtins';
import { DashboardViewerPicker } from './components/dashboard-viewer-picker';

export default async function DashboardsViewerPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');
  if (!admin.is_super && !hasPermission(admin, 'admin.dashboards.view')) {
    redirect('/admin');
  }
  const canEdit = admin.is_super || hasPermission(admin, 'admin.dashboards.edit');

  await ensureBuiltinsReconciled();

  const [details, grids] = await Promise.all([
    listAccessibleDashboards(admin, 'user_detail'),
    listAccessibleDashboards(admin, 'user_grid'),
  ]);
  const accessible = [...grids, ...details]; // grids first — primary surface going forward
  const dashboards = accessible.map((d) => ({
    id: d.id,
    slug: d.slug,
    label: d.label,
    description: d.description,
    scope: d.scope,
    is_builtin: d.is_builtin,
  }));

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--admin-text)' }}>Dashboards</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--admin-text-muted)' }}>
            Pick one of your dashboards, then search for a user to view it.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/dashboards/manage"
            className="text-xs px-3 py-1.5 rounded font-medium"
            style={{
              background: 'var(--admin-bg-elevated)',
              color: 'var(--admin-text)',
              border: '1px solid var(--admin-border)',
            }}
            title="Open the builder to create / edit dashboards"
          >
            ⚙ Manage
          </Link>
        )}
      </div>

      <DashboardViewerPicker dashboards={dashboards} />
    </div>
  );
}
