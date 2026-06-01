// Client-side recovery utilities.
//
// Three failure modes this guards against, all of which strand the user on an
// infinite spinner or a dead screen:
//   1. Stale bundle after a deploy — a cached HTML shell requests chunk hashes
//      that no longer exist, or loads a new chunk alongside a stale one so a
//      minified identifier goes undefined (e.g. "Can't find variable: X").
//   2. A hung/stale device session — sign-out didn't fully clear client state
//      (cache, storage, a stuck service worker, a corrupt Clerk token), so the
//      next sign-in never completes.
//   3. A third-party/init hang (Clerk JS never loads on a flaky network) so the
//      auth gate spins forever.
//
// `hardResetClientState` is the nuclear "clean slate for this device" action
// behind the recovery button: sign out, drop every cache/SW/storage we can
// reach from JS, then hard-navigate to a fresh entry point. It cannot delete
// httpOnly cookies, so it best-effort calls Clerk.signOut() first to clear the
// session server-side.

const RELOAD_GUARD_KEY = 'hmu_recovery_reload_at';
const RELOAD_GUARD_MS = 15_000;

/**
 * Returns true at most once per 15s window, so auto-reload can recover from a
 * stale bundle without spinning into a tight reload loop on a deterministic bug.
 */
export function canAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    return true;
  } catch {
    return true; // private mode — no guard available, allow the reload
  }
}

/** A chunk/module load failure — always safe to recover via a fresh reload. */
export function isChunkError(message: string, name = ''): boolean {
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(
      message,
    )
  );
}

/**
 * True when an error originated from our own JS bundle (a /_next/static chunk
 * on this origin). Used to decide whether an otherwise-unrecognized error
 * (e.g. a ReferenceError from a stale chunk) is worth a one-shot recovery
 * reload — without reacting to noise injected by browser extensions or
 * in-app browsers, whose sources are NOT our chunks.
 */
export function isOwnBundleSource(filename: string | undefined): boolean {
  if (!filename) return false;
  return filename.includes('/_next/static/') && filename.includes(location.host);
}

function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([p, new Promise<void>((res) => setTimeout(res, ms))]);
}

/**
 * Wipe everything reachable from JS for this device and reload to a clean
 * entry point. Best-effort and never throws — each step is independently
 * guarded so one failure can't block the rest.
 */
export async function hardResetClientState(redirectTo = '/sign-in'): Promise<void> {
  if (typeof window === 'undefined') return;

  // 1. Sign out of Clerk first (clears the httpOnly session cookie + server
  //    session that JS can't touch). Time-boxed so a hung Clerk can't block.
  try {
    const clerk = (window as unknown as { Clerk?: { signOut?: () => Promise<unknown> } }).Clerk;
    if (clerk?.signOut) await raceTimeout(clerk.signOut(), 2_000);
  } catch { /* ignore */ }

  // 2. Unregister any service workers (a stale SW can serve a broken shell).
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
  } catch { /* ignore */ }

  // 3. Delete all Cache Storage entries (stale precached assets).
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch { /* ignore */ }

  // 4. Clear app storage (cached state, drafts, stale tokens).
  try { localStorage.clear(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }

  // 5. Hard-navigate to a fresh entry point with a cache-buster so the browser
  //    fetches new HTML + chunk references rather than a cached response.
  const sep = redirectTo.includes('?') ? '&' : '?';
  window.location.replace(`${redirectTo}${sep}_fresh=${Date.now()}`);
}
