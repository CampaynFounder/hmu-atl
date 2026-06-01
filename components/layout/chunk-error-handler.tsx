'use client';

import { useEffect } from 'react';
import { canAutoReload, isChunkError, isOwnBundleSource } from '@/lib/client-recovery';

// Catches bundle-load failures BEFORE React's error boundaries see them.
// Error boundaries only fire during render/commit — errors thrown in a lazy
// import, an event handler, or an async callback escape them and either show
// "Something went wrong" or, worse, leave the app stuck on a spinner.
//
// Two listeners:
//   • unhandledrejection — chunk/module load failures (client-side navigation
//     after a deploy rotated chunk hashes). Always safe to reload.
//   • error — synchronous errors thrown FROM OUR OWN /_next/static bundle
//     (e.g. "Can't find variable: X" when a stale chunk leaves a minified
//     identifier undefined). Scoped to our chunks so browser-extension and
//     in-app-browser noise never triggers a reload.
//
// Both share a 15s one-shot guard so a deterministic bug can't loop. After one
// recovery reload the app-recovery watchdog / error boundary takes over.
export function ChunkErrorHandler() {
  useEffect(() => {
    function recover(why: string) {
      if (!canAutoReload()) return;
      console.warn('[hmu:recover] reloading to fresh bundle —', why);
      // href assignment (not reload()) so the browser fetches fresh HTML and
      // doesn't replay a cached response from the HTTP cache.
      window.location.href = window.location.href;
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason as { name?: string; message?: string } | undefined;
      if (!reason || typeof reason !== 'object') return;
      if (!isChunkError(reason.message ?? '', reason.name ?? '')) return;
      event.preventDefault();
      recover('chunk import rejection');
    }

    function handleError(event: ErrorEvent) {
      const msg = event.message ?? '';
      const name = (event.error as { name?: string } | undefined)?.name ?? '';
      // Chunk/module errors anywhere, OR any uncaught error sourced from our
      // own bundle (the stale-chunk ReferenceError case).
      if (isChunkError(msg, name) || isOwnBundleSource(event.filename)) {
        recover(`uncaught ${name || 'error'}: ${msg.slice(0, 80)}`);
      }
    }

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null;
}
