'use client';

import { useEffect } from 'react';

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

// Timestamp-based guard: allow one auto-reload per 15-second window.
// A simple presence flag gets stuck for the rest of the browser session.
function canAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem('hmu_chunk_reload_at') ?? 0);
    return Date.now() - last > 15_000;
  } catch {
    return true;
  }
}

function markReloaded() {
  try { sessionStorage.setItem('hmu_chunk_reload_at', String(Date.now())); } catch { /* private */ }
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Always log so it's visible in browser console / wrangler tail
    console.error('[hmu:global-error]', {
      name: error?.name,
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });

    if (isChunkError(error) && canAutoReload()) {
      markReloaded();
      window.location.reload();
    }
  }, [error]);

  const chunk = isChunkError(error);

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
          {chunk ? 'Updating…' : 'Something went wrong'}
        </div>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 4, maxWidth: 320 }}>
          {chunk
            ? 'Loading the latest version — hang tight.'
            : 'An unexpected error occurred. Check the browser console for details.'}
        </p>
        {/* Error type visible to admin/dev without opening devtools */}
        {error?.name && !chunk && (
          <p style={{ fontSize: 11, color: '#555', marginBottom: 20, fontFamily: 'monospace' }}>
            {error.name}{error.digest ? ` · digest: ${error.digest}` : ''}
          </p>
        )}
        <button
          onClick={() => {
            try { sessionStorage.removeItem('hmu_chunk_reload_at'); } catch { /* private */ }
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
            marginTop: chunk ? 0 : 8,
          }}
        >
          {chunk ? 'Reload now' : 'Try Again'}
        </button>
      </body>
    </html>
  );
}
