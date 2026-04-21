'use client';

import { useState, type ReactNode } from 'react';

interface Tab { id: string; label: string; content: ReactNode }

export default function PricingTabs({ tabs, defaultTabId }: { tabs: Tab[]; defaultTabId?: string }) {
  const [active, setActive] = useState(defaultTabId ?? tabs[0]?.id ?? '');

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-neutral-800 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ' +
                (isActive
                  ? 'border-emerald-500 text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300')
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div key={tab.id} className={tab.id === active ? '' : 'hidden'}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}
