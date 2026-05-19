'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// SHA baked into the bundle at build time by the deploy workflow.
// Empty string in local dev (no deploy SHA injected).
const CLIENT_SHA = process.env.NEXT_PUBLIC_DEPLOY_SHA ?? '';

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

function canReload(): boolean {
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

function hardNav() {
  // Assign (not reload) so the browser fetches fresh HTML, bypassing bfcache.
  window.location.href = window.location.href;
}

export function ChunkErrorHandler() {
  const pathname = usePathname();
  const initialPath = useRef(pathname);
  const staleChecked = useRef(false);

  // ── Proactive stale-build check ────────────────────────────────────────────
  // On the FIRST client-side navigation, compare the baked-in CLIENT_SHA
  // against the server's current SHA from /api/health. If they differ the
  // bundle is stale (deployed since the tab was opened) — force a full reload
  // before any chunk error can surface. One request per session; non-fatal if
  // the endpoint is unreachable.
  useEffect(() => {
    if (!CLIENT_SHA) return;                        // skip in local dev
    if (staleChecked.current) return;               // already ran
    if (pathname === initialPath.current) return;   // not yet navigated

    staleChecked.current = true;

    fetch('/api/health', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { version?: { sha?: string } }) => {
        const serverSha = data?.version?.sha;
        if (serverSha && serverSha !== CLIENT_SHA && canReload()) {
          console.warn(`[hmu:stale-build] client=${CLIENT_SHA} server=${serverSha} — reloading`);
          markReloaded();
          hardNav();
        }
      })
      .catch(() => { /* non-fatal — chunkerror handler is the safety net */ });
  }, [pathname]);

  // ── Reactive chunk-error handler ───────────────────────────────────────────
  // Catches ChunkLoadErrors at the Promise-rejection level — before React's
  // error boundaries see them. Fires when the proactive check above missed a
  // stale bundle (e.g. handler wasn't mounted yet on the very first nav).
  useEffect(() => {
    function handleRejection(event: PromiseRejectionEvent) {
      if (!isChunkError(event.reason)) return;
      event.preventDefault();
      console.warn('[hmu:chunk-reload] stale chunk — reloading');
      if (!canReload()) return;
      markReloaded();
      hardNav();
    }

    window.addEventListener('unhandledrejection', handleRejection);
    return () => window.removeEventListener('unhandledrejection', handleRejection);
  }, []);

  return null;
}
