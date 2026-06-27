// Reads the superadmin-controlled HMU First config (enable flag + price) so the
// driver UI can suppress upsell containers and show the current price.
// GET /api/driver/hmu-first → { enabled, priceCents }
//
// Defaults to enabled + $9.99 while loading / on failure, so a transient error
// never hides a feature that is actually open.

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { apiClient } from '@/lib/api';

export interface HmuFirstConfig {
  enabled: boolean;
  priceCents: number;
}

const DEFAULT: HmuFirstConfig = { enabled: true, priceCents: 999 };

/** Format cents as a price label, e.g. 999 → "$9.99", 1000 → "$10". */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function useHmuFirst(): HmuFirstConfig {
  const { getToken } = useAuth();
  const [config, setConfig] = useState<HmuFirstConfig>(DEFAULT);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const t = await getToken();
        const d = await apiClient<HmuFirstConfig>('/driver/hmu-first', t);
        if (active && typeof d.enabled === 'boolean') setConfig(d);
      } catch { /* keep defaults */ }
    })();
    return () => { active = false; };
  }, [getToken]);

  return config;
}
