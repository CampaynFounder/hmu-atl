'use client';

import ErrorFallback from '@/components/shared/error-fallback';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      message={error?.message || 'An unexpected error occurred.'}
      reset={reset}
    />
  );
}
