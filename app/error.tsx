'use client';

import { useEffect } from 'react';
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
