'use client';

// Fire-and-forget first-touch attribution capture.
// Always posts on first landing — even with no UTM and no external referrer —
// so direct/organic visitors land in their own queryable bucket
// (utm_campaign IS NULL) instead of having no row at all. Server is idempotent
// via ON CONFLICT (cookie_id) DO NOTHING, so the second navigation is a no-op
// at the DB level even if React fires the effect again.

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function AttributionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;

    const utm = {
      utm_source: searchParams.get('utm_source'),
      utm_medium: searchParams.get('utm_medium'),
      utm_campaign: searchParams.get('utm_campaign'),
      utm_content: searchParams.get('utm_content'),
      utm_term: searchParams.get('utm_term'),
    };

    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    const externalReferrer = referrer && !referrer.includes(window.location.hostname);

    sentRef.current = true;
    const payload = {
      ...utm,
      referrer: externalReferrer ? referrer : null,
      landing_path: pathname,
    };

    fetch('/api/attribution/touch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }, [pathname, searchParams]);

  return null;
}
