'use client';

// Tab switcher for /admin/onboarding-config — one surface, two flavours
// (driver express, rider ad-funnel). Each panel is self-contained and
// hits its own API route, so flipping tabs preserves no shared state.

import { useState } from 'react';
import OnboardingConfigClient from './onboarding-config-client';
import RiderConfigPanel from './rider-config-panel';

type Tab = 'driver' | 'rider';

const TABS: { key: Tab; label: string; sub: string }[] = [
  { key: 'driver', label: 'Driver',     sub: '/driver/express' },
  { key: 'rider',  label: 'Rider',      sub: '/r/express' },
];

export default function OnboardingConfigTabs() {
  const [active, setActive] = useState<Tab>('driver');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-neutral-800">
        {TABS.map(t => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                on
                  ? 'border-[#00E676] text-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {t.label}
              <span className="ml-2 text-[10px] font-mono text-neutral-500">{t.sub}</span>
            </button>
          );
        })}
      </div>

      {active === 'driver' ? <OnboardingConfigClient /> : <RiderConfigPanel />}
    </div>
  );
}
