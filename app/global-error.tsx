'use client';

import { useEffect } from 'react';

// Detects stale JS chunks after a deploy. When Next.js can't load a chunk
// (the hash changed), it throws a ChunkLoadError that bypasses segment-level
// error boundaries and surfaces here. Auto-reload fetches fresh chunks and
// resolves it transparently. A sessionStorage flag prevents infinite loops
// if the chunk is genuinely broken (not just stale).
function isChunkError(error: Error): boolean {
  const msg = error?.message ?? '';
  const name = error?.name ?? '';
  return (
    name === 'ChunkLoadError' ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed')
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isChunkError(error)) {
      const key = 'hmu_chunk_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return;
      }
      // Second failure — clear flag so future deploys can retry
      sessionStorage.removeItem(key);
    }
  }, [error]);

  return (
    <html>
      <body style={{
        margin: 0,
        background: '#080808',
        color: '#fff',
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        fontFamily: "'DM Sans', sans-serif",
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>⚠️</div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 28,
          marginBottom: 8,
          letterSpacing: 1,
        }}>
          Something went wrong
        </div>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 24, maxWidth: 300 }}>
          {isChunkError(error)
            ? 'Reloading to pick up the latest version…'
            : 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => {
            sessionStorage.removeItem('hmu_chunk_reload');
            reset();
          }}
          style={{
            padding: '12px 28px',
            borderRadius: 100,
            border: 'none',
            background: '#00E676',
            color: '#080808',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
