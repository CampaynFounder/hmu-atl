'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import ErrorFallback from '@/components/shared/error-fallback';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Surface the stack + Next digest in wrangler tail so we can diagnose the
  // next production "something went wrong" without the user having to repro.
  useEffect(() => {
    const msg = error?.message ?? '';
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Importing a module script failed');

    // Always log so it's visible in browser console and wrangler tail
    console.error('[hmu:error]', {
      name: error?.name,
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });

    if (isChunkError) {
      // Timestamp guard: allow one auto-reload per 15s window, not a
      // sticky session flag that blocks retries across navigations.
      try {
        const last = Number(sessionStorage.getItem('hmu_chunk_reload_at') ?? 0);
        if (Date.now() - last > 15_000) {
          sessionStorage.setItem('hmu_chunk_reload_at', String(Date.now()));
          window.location.reload();
          return;
        }
      } catch { /* private mode — fall through */ }
    }

    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorFallback
      message={error?.message || 'An unexpected error occurred.'}
      reset={reset}
    />
  );
}
