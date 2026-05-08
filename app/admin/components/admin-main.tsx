'use client';

import { useSidebar } from './sidebar-context';
import { useAdminAuth } from './admin-auth-context';
import { AdminSearchBar } from './admin-search-bar';
import { DeployBadge } from './deploy-badge';

export function AdminMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const { admin } = useAdminAuth();
  // When previewing: mobile top bar (64px) is pushed down by the 36px banner,
  // so content needs 100px of top padding; desktop has no mobile bar but
  // still owes the banner 36px. Static class strings so Tailwind JIT picks
  // them up at build time.
  const padClass = admin?.isPreview ? 'pt-[100px] lg:pt-[36px]' : 'pt-16 lg:pt-0';

  return (
    <main
      className={`
        flex-1 min-h-screen overflow-y-auto transition-[margin] duration-200 ease-in-out
        ${padClass}
        ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}
      `}
      style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)' }}
    >
      <div className="px-4 pb-4 pt-2 lg:p-6 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <AdminSearchBar />
          </div>
          <DeployBadge />
        </div>
        {children}
      </div>
    </main>
  );
}
