// /admin/dashboards/new — super-only dashboard builder, blank slate.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { DashboardForm } from '../components/dashboard-form';

export default async function NewDashboardPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');
  if (!admin.is_super && !hasPermission(admin, 'admin.dashboards.edit')) {
    redirect('/admin/dashboards');
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--admin-text)' }}>New dashboard</h1>
        <Link href="/admin/dashboards" className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
          ← back to list
        </Link>
      </div>
      <DashboardForm mode="create" />
    </div>
  );
}
