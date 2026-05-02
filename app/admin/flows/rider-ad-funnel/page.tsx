import { redirect } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import RiderAdFunnelFlowClient from './client';

export const dynamic = 'force-dynamic';

export default async function RiderAdFunnelFlowPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin');
  if (!hasPermission(admin, 'tools.flows.view')) redirect('/admin');
  return <RiderAdFunnelFlowClient />;
}
