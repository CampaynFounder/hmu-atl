'use client';

import { useEffect } from 'react';
import { fbEvent } from '@/components/analytics/meta-pixel';

/**
 * Persists the sign-up type and returnTo to localStorage before Clerk's OAuth
 * redirect. OAuth does a full page unload → provider → callback, which loses
 * URL params. auth-callback reads these back as a fallback.
 */
export function SignUpTypeStore({ type, returnTo, cash, mode }: { type?: string; returnTo?: string; cash?: string; mode?: string }) {
  useEffect(() => {
    if (type) {
      localStorage.setItem('hmu_signup_type', type);
    }
    if (returnTo) {
      localStorage.setItem('hmu_signup_returnTo', returnTo);
    }
    if (cash === '1') {
      localStorage.setItem('hmu_signup_cash', '1');
    }
    if (mode) {
      localStorage.setItem('hmu_signup_mode', mode);
    }
    // Fire Lead event — user reached sign-up page
    fbEvent('Lead', { content_name: type || 'direct', content_category: type === 'driver' ? 'driver_funnel' : 'rider_funnel' });
  }, [type, returnTo, cash, mode]);

  return null;
}
