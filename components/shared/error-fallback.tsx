'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';

interface ErrorFallbackProps {
  title?: string;
  message?: string;
  reset?: () => void;
  showTryAgain?: boolean;
}

export default function ErrorFallback({
  title = 'Something went wrong',
  message = 'An unexpected error occurred.',
  reset,
  showTryAgain = true,
}: ErrorFallbackProps) {
  const { user, isLoaded } = useUser();
  const [retrying, setRetrying] = useState(false);

  // Determine the right "home" based on profile type
  let homeHref = '/';
  if (isLoaded && user) {
    const profileType = user.publicMetadata?.profileType as string | undefined;
    if (profileType === 'driver') {
      homeHref = '/driver/home';
    } else if (profileType === 'rider') {
      homeHref = '/rider/home';
    } else if (profileType === 'admin') {
      homeHref = '/admin';
    } else {
      // Logged in but no profile type — send to onboarding
      homeHref = '/onboarding';
    }
  }

  function handleTryAgain() {
    setRetrying(true);
    if (reset) {
      reset();
      // If reset doesn't navigate away within 2s, hard reload
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      window.location.reload();
    }
  }

  return (
    <div style={{
      background: '#080808',
      color: '#fff',
      minHeight: '100svh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.4 }}>{'\u26A0\uFE0F'}</div>
      <h1 style={{
        fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
        fontSize: '28px',
        marginBottom: '8px',
      }}>
        {title}
      </h1>
      <p style={{ fontSize: '14px', color: '#888', marginBottom: '24px', maxWidth: '300px' }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        {showTryAgain && (
          <button
            onClick={handleTryAgain}
            disabled={retrying}
            style={{
              padding: '12px 24px',
              borderRadius: '100px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color: '#bbb',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
              opacity: retrying ? 0.5 : 1,
            }}
          >
            {retrying ? 'Retrying...' : 'Try Again'}
          </button>
        )}
        <Link
          href={homeHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '12px 24px',
            borderRadius: '100px',
            border: 'none',
            background: '#00E676',
            color: '#080808',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
            fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
          }}
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
