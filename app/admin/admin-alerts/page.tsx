import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import AdminAlertsClient from './admin-alerts-client';

export const dynamic = 'force-dynamic';

export default async function AdminAlertsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/sign-in');
  if (!admin.is_super) redirect('/admin');
  return <AdminAlertsClient />;
}
