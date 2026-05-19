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

    if (isChunkError) {
      const key = 'hmu_chunk_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(key);
    }

    Sentry.captureException(error);
    console.error('[global-error]', {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });
  }, [error]);

  return (
    <ErrorFallback
      message={error?.message || 'An unexpected error occurred.'}
      reset={reset}
    />
  );
}
