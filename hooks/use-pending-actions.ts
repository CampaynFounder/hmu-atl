'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { useAbly } from '@/hooks/use-ably';
import type { PendingAction } from '@/app/api/users/pending-actions/route';

const POLL_INTERVAL = 30_000; // 30 seconds
const CACHE_KEY = 'hmu_pending_actions';
const CACHE_TTL = 15_000; // 15 seconds

interface CachedActions {
  actions: PendingAction[];
  fetchedAt: number;
}

/**
 * Hook that fetches and polls pending actions for the current user.
 * Returns the ranked list and the top (most urgent) action.
 * Caches in memory + localStorage to avoid flash on mount.
 */
export function usePendingActions() {
  const [actions, setActions] = useState<PendingAction[]>(() => {
    // Hydrate from localStorage cache on mount
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachedActions = JSON.parse(cached);
        if (Date.now() - parsed.fetchedAt < CACHE_TTL * 4) {
          return parsed.actions;
        }
      }
    } catch { /* ignore */ }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { isLoaded, isSignedIn } = useUser();

  // Background polls must NEVER toggle `loading`. Flipping loading on each 30s
  // tick re-renders subscribers (even with stable `actions` reference), which
  // re-runs framer-motion's `layout` measurement in PendingActionBanner and
  // reads to the user as a full-screen "reset" every 30s. Only user-initiated
  // or cold-cache fetches surface loading state.
  const fetchActions = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch('/api/users/pending-actions');
      if (!res.ok) return;
      const data = await res.json();
      const fetched = (data.actions || []) as PendingAction[];

      // Only swap the array reference when the content actually changed.
      setActions(prev => actionsEqual(prev, fetched) ? prev : fetched);

      // Cache to localStorage
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          actions: fetched,
          fetchedAt: Date.now(),
        }));
      } catch { /* quota */ }
    } catch { /* offline */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    // Check if cache is stale
    let shouldFetch = true;
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachedActions = JSON.parse(cached);
        if (Date.now() - parsed.fetchedAt < CACHE_TTL) {
          shouldFetch = false;
        }
      }
    } catch { /* ignore */ }

    if (shouldFetch) fetchActions();

    // Visibility-gated polling: only tick while the tab is visible. Prevents
    // wasted background fetches and keeps battery/data overhead low on PWA.
    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => { fetchActions({ silent: true }); }, POLL_INTERVAL);
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (typeof document === 'undefined' || !document.hidden) start();

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Catch up on return to foreground, then resume polling. Silent so the
        // catch-up fetch doesn't flash a loading state on every tab focus.
        fetchActions({ silent: true });
        start();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [fetchActions]);

  // Resolve internal user ID for the Ably channel name. Same pattern as
  // GlobalRideAlert — Clerk gives us a clerk_id but the notify channel uses
  // our internal users.id.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) { setInternalUserId(null); return; }
    let cancelled = false;
    fetch('/api/users/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data?.id) setInternalUserId(data.id); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  // Refresh pending actions immediately when ANY notify event lands. The
  // 30s poll is the floor; this gives us sub-second response so the
  // 'driver_passed' (and every other) banner appears the moment the server
  // publishes, not on the next tick.
  useAbly({
    channelName: internalUserId ? `user:${internalUserId}:notify` : null,
    onMessage: useCallback(() => { fetchActions({ silent: true }); }, [fetchActions]),
  });

  const topAction = actions.length > 0 ? actions[0] : null;

  const dismiss = useCallback((actionId: string) => {
    setActions(prev => {
      const filtered = prev.filter(a => a.id !== actionId);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          actions: filtered,
          fetchedAt: Date.now(),
        }));
      } catch { /* ignore */ }
      return filtered;
    });
  }, []);

  return { actions, topAction, loading, refresh: fetchActions, dismiss };
}

// Identity-preserving comparison — if the list of actions is unchanged by the
// fields the UI renders, we keep the previous array reference so React bails
// out of re-rendering. Intentionally shallow: only the handful of fields the
// banner displays matter for visual equality.
function actionsEqual(a: PendingAction[], b: PendingAction[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (
      x.id !== y.id ||
      x.type !== y.type ||
      x.priority !== y.priority ||
      x.title !== y.title ||
      x.subtitle !== y.subtitle ||
      x.cta !== y.cta ||
      x.href !== y.href ||
      x.color !== y.color ||
      x.emoji !== y.emoji
    ) return false;
  }
  return true;
}
