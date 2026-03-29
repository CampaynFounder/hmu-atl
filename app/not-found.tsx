'use client';

import ErrorFallback from '@/components/shared/error-fallback';

export default function NotFound() {
  return (
    <ErrorFallback
      title="404"
      message="This page doesn't exist or was moved."
      showTryAgain={false}
    />
  );
}
