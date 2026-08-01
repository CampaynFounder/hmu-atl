import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';
import SeedDataClient from './seed-data-client';

export const dynamic = 'force-dynamic';

export default async function SeedDataPage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/sign-in');
  if (!admin.is_super) redirect('/admin');

  const markets = (await sql`
    SELECT id, name, slug FROM markets ORDER BY name ASC
  `) as { id: string; name: string; slug: string }[];

  return <SeedDataClient markets={markets} />;
}
