// /admin/blast — Stream D index page. Permission: monitor.blasts.view.
// Listing of blasts with funnel-stage filters; click row → /admin/blast/[id].

import { redirect } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { AdminBlastIndexClient } from './admin-blast-index-client';

export const dynamic = 'force-dynamic';

export default async function AdminBlastIndexPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/sign-in?returnTo=/admin/blast');
  if (!hasPermission(admin, 'monitor.blasts.view')) redirect('/admin');
  return <AdminBlastIndexClient />;
}
