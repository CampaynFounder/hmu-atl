'use client';

// Driver foreground presence on `market:{slug}:drivers_available`.
// Presence is the server-side gate for HMU-send — if the driver isn't a member,
// /api/driver/hmu returns 409. We enter on mount + window focus, leave on
// blur / unmount / visibilitychange:hidden so HMU-send mirrors "live" status.

import { useEffect, useRef } from 'react';

export function useDriverPresence(marketSlug: string | null) {
  const clientRef = useRef<unknown>(null);
  const channelRef = useRef<unknown>(null);

  useEffect(() => {
    if (!marketSlug) return;
    if (typeof document === 'undefined') return;

    let cancelled = false;
    const channelName = `market:${marketSlug}:drivers_available`;

    async function connect() {
      try {
        const Ably = await import('ably');
        if (cancelled) return;

        // We rely on the existing /api/ably/token route to grant
        // [publish, presence] to drivers on market:*:drivers_available.
        const client = new Ably.Realtime({
          authCallback: async (_tokenParams, cb) => {
            try {
              const res = await fetch('/api/ably/token', { method: 'POST' });
              const td = await res.json();
              cb(null, td);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'token error';
              cb(msg, null);
            }
          },
        });
        clientRef.current = client;

        const channel = client.channels.get(channelName);
        channelRef.current = channel;

        const enterIfVisible = () => {
          if (document.visibilityState === 'visible') {
            channel.presence.enter({ at: Date.now() }).catch((e: unknown) => console.warn('[driver-presence] enter failed', e));
          } else {
            channel.presence.leave().catch(() => { /* silent — we may not be in presence */ });
          }
        };

        const onVisibility = () => enterIfVisible();
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
        window.addEventListener('blur', onVisibility);

        enterIfVisible();

        // Store cleanup hooks in closure — React strict mode will double-invoke
        // this effect in dev, which is why we gate with `cancelled`.
        (channelRef as React.MutableRefObject<unknown>).current = {
          channel,
          dispose: () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener('blur', onVisibility);
            try { channel.presence.leave(); } catch { /* silent */ }
          },
        };
      } catch (err) {
        console.error('[driver-presence] connection error', err);
      }
    }

    connect();

    return () => {
      cancelled = true;
      const ref = channelRef.current as { dispose?: () => void } | null;
      if (ref?.dispose) ref.dispose();
      const c = clientRef.current as { close?: () => void } | null;
      try { c?.close?.(); } catch { /* silent */ }
      channelRef.current = null;
      clientRef.current = null;
    };
  }, [marketSlug]);
}
