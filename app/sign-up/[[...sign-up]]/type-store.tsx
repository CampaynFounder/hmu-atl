'use client';

import { useEffect } from 'react';
import { fbEvent } from '@/components/analytics/meta-pixel';

/**
 * Persists the sign-up type and returnTo to localStorage before Clerk's OAuth
 * redirect. OAuth does a full page unload → provider → callback, which loses
 * URL params. auth-callback reads these back as a fallback.
 */
export function SignUpTypeStore({ type, returnTo, cash, mode, draft, handle }: { type?: string; returnTo?: string; cash?: string; mode?: string; draft?: string; handle?: string }) {
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
    // Booking draft from /rider/browse → /sign-up. auth-callback reads these
    // back to consume the draft post-auth. OAuth redirects can lose URL params,
    // so localStorage is the durable channel.
    if (draft) {
      localStorage.setItem('hmu_signup_draft', draft);
    }
    if (handle) {
      localStorage.setItem('hmu_signup_handle', handle);
    }
    // Fire Lead event — user reached sign-up page
    fbEvent('Lead', { content_name: type || 'direct', content_category: type === 'driver' ? 'driver_funnel' : 'rider_funnel' });
  }, [type, returnTo, cash, mode, draft, handle]);

  return null;
}
