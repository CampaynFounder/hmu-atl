import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/helpers';
import CoverageClient from './coverage-client';

export const dynamic = 'force-dynamic';

export default async function CoveragePage() {
  const admin = await requireAdmin();
  if (!admin) redirect('/admin-login');

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div>
          <h1 className="text-sm font-semibold text-white">Market Coverage</h1>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            Set driver home bases to improve ride matching coverage
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <CoverageClient />
      </div>
    </div>
  );
}
