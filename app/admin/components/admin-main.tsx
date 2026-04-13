'use client';

import { useSidebar } from './sidebar-context';

export function AdminMain({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className={`
        flex-1 min-h-screen overflow-y-auto transition-[margin] duration-200 ease-in-out
        ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}
      `}
    >
      <div className="p-4 lg:p-6 max-w-[1600px] mx-auto">
        {children}
      </div>
    </main>
  );
}
