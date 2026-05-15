// /admin/blast-config/v3 — Stream E no-code config UI.
// Lives at a dedicated sub-route per non-regression rule §11.4: the existing
// /admin/blast-config root remains live and unchanged. Admin can opt into the
// new UI by visiting /v3 directly; old URL still works exactly as before.

import { redirect } from 'next/navigation';
import { sql } from '@/lib/db/client';
import { requireAdmin, hasPermission } from '@/lib/admin/helpers';
import { BlastConfigV3Client } from './blast-config-v3-client';

export const dynamic = 'force-dynamic';

interface MarketRow {
  slug: string;
  name: string;
}

export default async function BlastConfigV3Page() {
  const admin = await requireAdmin();
  if (!admin) redirect('/sign-in?returnTo=/admin/blast-config/v3');
  if (!hasPermission(admin, 'admin.blastconfig.view')) redirect('/admin');

  // Load markets so the per-market tab strip renders server-side.
  const rows = await sql`
    SELECT slug, name FROM markets WHERE blast_enabled = true ORDER BY slug ASC
  `;
  const markets = rows.map((r: Record<string, unknown>) => ({
    slug: r.slug as string,
    name: r.name as string,
  })) as MarketRow[];

  const canEdit = hasPermission(admin, 'admin.blastconfig.edit');

  return <BlastConfigV3Client markets={markets} canEdit={canEdit} />;
}
