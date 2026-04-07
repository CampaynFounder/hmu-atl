'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users/pending-actions');
      if (!res.ok) return;
      const data = await res.json();
      const fetched = (data.actions || []) as PendingAction[];
      setActions(fetched);

      // Cache to localStorage
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          actions: fetched,
          fetchedAt: Date.now(),
        }));
      } catch { /* quota */ }
    } catch { /* offline */ }
    finally { setLoading(false); }
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

    // Poll at interval
    intervalRef.current = setInterval(fetchActions, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchActions]);

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
