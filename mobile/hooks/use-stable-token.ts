import { useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';

/**
 * Clerk's `useAuth().getToken` returns a NEW function identity on most renders.
 * Any component that puts `getToken` in a `useEffect`/`useCallback` dependency
 * array therefore re-runs that effect on every render — and when the effect
 * fetches + setState, that's an infinite re-fetch loop bounded only by network
 * latency (the cause of the prod request storm: thousands of /rides/active,
 * /browse/list, /driver/* calls per minute saturating Neon).
 *
 * This hook returns a STABLE `getToken` (constant identity for the component's
 * lifetime) that always delegates to the latest Clerk getToken via a ref. Drop
 * it in as `const getToken = useStableToken();` instead of destructuring from
 * useAuth, and existing `[getToken]` deps become safe automatically.
 */
export function useStableToken(): ReturnType<typeof useAuth>['getToken'] {
  const { getToken } = useAuth();
  const ref = useRef(getToken);
  ref.current = getToken;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useCallback(((opts?: any) => ref.current(opts)) as typeof getToken, []);
}
