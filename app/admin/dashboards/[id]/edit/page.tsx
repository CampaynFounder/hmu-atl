// /admin/dashboards/[id]/edit — super-only dashboard editor.
// Loads the dashboard + blocks + grants, hands them to the shared form.

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import { loadDashboardById } from '@/lib/admin/dashboards/runtime';
import { DashboardForm, type DashboardFormInitial } from '../../components/dashboard-form';

export default async function EditDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');
  if (!admin.is_super && !hasPermission(admin, 'admin.dashboards.edit')) {
    redirect('/admin/dashboards');
  }

  const { id } = await params;
  const bundle = await loadDashboardById(id);
  if (!bundle) notFound();

  const grantRows = await sql`
    SELECT role_id FROM admin_dashboard_role_grants WHERE dashboard_id = ${id}
  `;

  const initial: DashboardFormInitial = {
    id: bundle.dashboard.id,
    slug: bundle.dashboard.slug,
    label: bundle.dashboard.label,
    description: bundle.dashboard.description,
    scope: bundle.dashboard.scope,
    market_id: bundle.dashboard.market_id,
    sections: bundle.sections.map((s) => ({
      label: s.label ?? '',
      field_keys: s.field_keys,
      col_span: s.col_span,
    })),
    role_ids: grantRows.map((r: Record<string, unknown>) => r.role_id as string),
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--admin-text)' }}>
            Edit: {bundle.dashboard.label}
          </h1>
          {bundle.dashboard.is_builtin && (
            <p className="text-[11px] mt-1" style={{ color: '#f59e0b' }}>
              ⚠ Builtin dashboard — changes will be overwritten by the next reconcile run.
            </p>
          )}
        </div>
        <Link href="/admin/dashboards" className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
          ← back to list
        </Link>
      </div>
      <DashboardForm mode="edit" initial={initial} />
    </div>
  );
}
