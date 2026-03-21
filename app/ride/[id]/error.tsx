'use client';

import Link from 'next/link';

export default function RideError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        Something went wrong
      </h1>
      <p style={{ fontSize: '14px', color: '#888', marginBottom: '24px', maxWidth: '300px' }}>
        {error.message || 'This ride could not be loaded.'}
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={reset}
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
          }}
        >
          Try Again
        </button>
        <Link
          href="/"
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
