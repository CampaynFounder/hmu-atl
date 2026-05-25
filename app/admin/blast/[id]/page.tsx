// /admin/blast/[id] — Stream D per-blast observability detail page.
// Permission: monitor.blasts.view.

import { redirect } from 'next/navigation';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { AdminBlastDetailClient } from './admin-blast-detail-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBlastDetailPage({ params }: PageProps) {
  const admin = await requireAdmin();
  if (!admin) redirect('/sign-in?returnTo=/admin/blast');
  if (!hasPermission(admin, 'monitor.blasts.view')) redirect('/admin');
  const { id } = await params;
  return <AdminBlastDetailClient blastId={id} />;
}
