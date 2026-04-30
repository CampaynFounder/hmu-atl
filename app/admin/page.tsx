import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import { LiveOpsDashboard } from './components/live-ops-dashboard';

export default async function AdminPage() {
  // Live Ops is super-admin only. Layout already enforced is_admin; this is
  // the second gate so a direct URL hit can't bypass the sidebar filter.
  // requireAdmin applies the preview-role swap, so a super previewing a lower
  // role correctly gets redirected just like that role would.
  const admin = await requireAdmin();
  if (!admin?.is_super) redirect('/admin/support');
  return <LiveOpsDashboard />;
}
