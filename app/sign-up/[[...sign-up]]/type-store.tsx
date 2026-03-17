'use client';

import { useEffect } from 'react';

/**
 * Persists the sign-up type and returnTo to localStorage before Clerk's OAuth
 * redirect. OAuth does a full page unload → provider → callback, which loses
 * URL params. auth-callback reads these back as a fallback.
 */
export function SignUpTypeStore({ type, returnTo }: { type?: string; returnTo?: string }) {
  useEffect(() => {
    if (type) {
      localStorage.setItem('hmu_signup_type', type);
    }
    if (returnTo) {
      localStorage.setItem('hmu_signup_returnTo', returnTo);
    }
  }, [type, returnTo]);

  return null;
}
