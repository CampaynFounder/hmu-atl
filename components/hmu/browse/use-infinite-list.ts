'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PageResult<T> {
  items: T[];
  hasMore: boolean;
}

export interface InfiniteListOptions<T> {
  /** Items rendered by the SSR pre-render. Used to seed list + offset. */
  initialItems: T[];
  /** Page size used by the SSR render. Drives the initial `hasMore` guess. */
  initialBatchSize: number;
  /** Pulls a page from the server. Throw to skip the page (sentinel will retry). */
  fetchPage: (offset: number, limit: number) => Promise<PageResult<T>>;
  /** Limit per fetch. Defaults to `initialBatchSize`. */
  pageSize?: number;
  /** When true, after exhaustion the hook re-fetches from offset=0 to loop the feed. */
  allowLoop?: boolean;
  /** Stable key getter — used for de-duping non-loop pages. */
  getId: (item: T) => string;
  /** rootMargin for the IntersectionObserver. Defaults to '600px 0px'. */
  rootMargin?: string;
}

/**
 * Infinite-scroll engine shared by /driver/find-riders and /rider/browse. Handles:
 *
 *   - SSR-seeded list + offset
 *   - throttled IntersectionObserver pagination
 *   - end-of-list loop re-fetch (TikTok-feel) when allowLoop is set
 *   - safe `setItems` setter for surgical mutations (e.g. removing an HMU'd card)
 *
 * Each consumer renders its own card markup; this hook only owns pagination state
 * and the sentinel ref. Mount the returned `<div ref={sentinelRef} />` at the
 * bottom of whichever scroll container drives loading.
 */
export function useInfiniteList<T>({
  initialItems,
  initialBatchSize,
  fetchPage,
  pageSize,
  allowLoop = false,
  getId,
  rootMargin = '600px 0px',
}: InfiniteListOptions<T>) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length === initialBatchSize);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [canLoop, setCanLoop] = useState(allowLoop);

  const offsetRef = useRef(initialItems.length);
  const lastFetchRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const limit = pageSize ?? initialBatchSize;

  const fetchMore = useCallback(async () => {
    if (fetchingMore) return;
    if (Date.now() - lastFetchRef.current < 400) return;

    const looping = !hasMore;
    if (looping && (!canLoop || items.length === 0)) return;

    setFetchingMore(true);
    lastFetchRef.current = Date.now();
    try {
      const offset = looping ? 0 : offsetRef.current;
      const page = await fetchPage(offset, limit);
      const next = page.items;

      if (looping) {
        if (next.length === 0) {
          setCanLoop(false);
        } else {
          setItems((prev) => prev.concat(next));
        }
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map(getId));
          const fresh = next.filter((r) => !seen.has(getId(r)));
          offsetRef.current += next.length;
          return prev.concat(fresh);
        });
        setHasMore(page.hasMore);
      }
    } catch {
      // Silent — sentinel retries on next intersection.
    } finally {
      setFetchingMore(false);
    }
  }, [fetchingMore, hasMore, canLoop, items.length, limit, fetchPage, getId]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    if (!hasMore && !canLoop) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) fetchMore(); },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchMore, hasMore, canLoop, items.length, rootMargin]);

  return {
    items,
    setItems,
    fetchingMore,
    hasMore,
    canLoop,
    sentinelRef,
    fetchMore,
  };
}
