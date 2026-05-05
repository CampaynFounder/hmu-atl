// /admin/dashboards/[id]/view — render a user_grid dashboard.

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/helpers';
import {
  loadDashboardById,
  canViewDashboard,
} from '@/lib/admin/dashboards/runtime';
import { getField } from '@/lib/admin/dashboards/fields/registry';
import { fieldMetadata } from '@/lib/admin/dashboards/fields/types';
import { GridView } from './grid-view';

export default async function DashboardGridViewPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');

  const { id } = await params;
  const bundle = await loadDashboardById(id);
  if (!bundle) notFound();
  if (bundle.dashboard.scope !== 'user_grid') {
    // Pivot: user_detail dashboards still render via /admin/users/[id], not here.
    redirect(`/admin/dashboards`);
  }

  const ok = await canViewDashboard(admin, bundle.dashboard);
  if (!ok) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: 'var(--admin-text-muted)' }}>
          You don&apos;t have access to this dashboard.
        </p>
      </div>
    );
  }

  const fieldKeys = bundle.sections.flatMap((s) => s.field_keys);
  const columns = fieldKeys
    .map((k) => getField(k))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .map((d) => fieldMetadata(d));

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--admin-text)' }}>{bundle.dashboard.label}</h1>
          {bundle.dashboard.description && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
              {bundle.dashboard.description}
            </p>
          )}
        </div>
        <Link
          href="/admin/dashboards"
          className="text-xs"
          style={{ color: 'var(--admin-text-muted)' }}
        >
          ← back to dashboards
        </Link>
      </div>
      <GridView dashboardId={bundle.dashboard.id} columns={columns} />
    </div>
  );
}
