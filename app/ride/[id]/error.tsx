'use client';

import ErrorFallback from '@/components/shared/error-fallback';

export default function RideError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      message={error?.message || 'This ride could not be loaded.'}
      reset={reset}
    />
  );
}
