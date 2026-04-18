'use client';

// Fire-and-forget first-touch attribution capture.
// Posts to /api/attribution/touch only when there's a UTM or external referrer.
// Server uses ON CONFLICT DO NOTHING so subsequent touches are no-ops.

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
    const hasUtm = Object.values(utm).some(Boolean);

    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    const externalReferrer = referrer && !referrer.includes(window.location.hostname);

    if (!hasUtm && !externalReferrer) return;

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
