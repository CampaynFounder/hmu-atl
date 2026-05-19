'use client';

import { useEffect } from 'react';

// Catches ChunkLoadErrors at the Promise-rejection level — BEFORE React's
// error boundaries see them. These happen when a user navigates client-side
// after a deploy has rotated the JS chunk hashes. The fix is a full page
// reload, which fetches fresh HTML with correct chunk URLs.
//
// Error boundaries only fire during React's render/commit phase. Chunk load
// errors during lazy-import (router navigation) are unhandled promise
// rejections — they escape error boundaries and show as "Application error"
// or "Something went wrong". This handler catches them earlier.
export function ChunkErrorHandler() {
  useEffect(() => {
    function isChunkError(reason: unknown): boolean {
      if (!reason || typeof reason !== 'object') return false;
      const err = reason as { name?: string; message?: string };
      const name = err.name ?? '';
      const msg = err.message ?? '';
      return (
        name === 'ChunkLoadError' ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('Importing a module script failed')
      );
    }

    function handleRejection(event: PromiseRejectionEvent) {
      if (!isChunkError(event.reason)) return;

      event.preventDefault(); // suppress browser console error

      console.warn('[hmu:chunk-reload] stale chunk detected, reloading');

      // Timestamp guard: one reload per 15-second window
      try {
        const last = Number(sessionStorage.getItem('hmu_chunk_reload_at') ?? 0);
        if (Date.now() - last < 15_000) return;
        sessionStorage.setItem('hmu_chunk_reload_at', String(Date.now()));
      } catch { /* private mode */ }

      // Use href assignment (not reload()) so the browser fetches fresh HTML
      // and doesn't serve a cached response from the HTTP cache.
      window.location.href = window.location.href;
    }

    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  return null;
}
