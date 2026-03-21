'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

const POSTHOG_KEY = 'phc_8lT1HF9VI6KtbfNM9dPECmIwvRzn1Ym7TEjGdQuDz5n';
const POSTHOG_HOST = 'https://us.i.posthog.com';

if (typeof window !== 'undefined' && !posthog.__loaded) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // We capture manually for SPA navigation
    capture_pageleave: true,
    persistence: 'localStorage',
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isSignedIn } = useUser();

  // Identify user when signed in
  useEffect(() => {
    if (isSignedIn && user) {
      posthog.identify(user.id, {
        profileType: user.publicMetadata?.profileType as string,
        tier: user.publicMetadata?.tier as string,
      });
    }
  }, [isSignedIn, user]);

  // Track page views on navigation
  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname;
      if (searchParams.toString()) url += '?' + searchParams.toString();
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  );
}

// Export for custom event tracking
export { posthog };
