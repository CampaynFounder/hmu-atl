import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import CreateMarketClient from './create-market-client';

export const dynamic = 'force-dynamic';

export default async function NewMarketPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');
  if (!admin.is_super) redirect('/admin/markets');
  return <CreateMarketClient />;
}
