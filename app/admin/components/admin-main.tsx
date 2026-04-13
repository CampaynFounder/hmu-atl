'use client';

import { useSidebar } from './sidebar-context';

export function AdminMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className={`
        flex-1 min-h-screen overflow-y-auto transition-[margin] duration-200 ease-in-out
        pt-16 lg:pt-0
        ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}
      `}
      style={{ background: 'var(--admin-bg)', color: 'var(--admin-text)' }}
    >
      <div className="px-4 pb-4 pt-2 lg:p-6 max-w-[1600px] mx-auto">
        {children}
      </div>
    </main>
  );
}
