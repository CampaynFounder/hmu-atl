import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import { getColdStartConfig, appliedSuspendSeconds, neonApiConfigured } from '@/lib/infra/cold-start';
import ColdStartClient from './cold-start-client';

export const dynamic = 'force-dynamic';

export default async function ColdStartAdminPage() {
  const admin = await requireAdmin();
  // Super-only — the route-permissions guard already enforces this; this is
  // defense-in-depth so the page never renders for the wrong role.
  if (!admin || !admin.is_super) redirect('/admin');

  const config = await getColdStartConfig();
  return (
    <ColdStartClient
      initialConfig={config}
      initialAppliedSeconds={appliedSuspendSeconds(config)}
      neonConfigured={neonApiConfigured()}
    />
  );
}
