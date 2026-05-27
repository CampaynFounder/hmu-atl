import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import PaymentsConfigClient from './payments-config-client';

export const dynamic = 'force-dynamic';

export default async function PaymentsConfigPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');
  return <PaymentsConfigClient />;
}
