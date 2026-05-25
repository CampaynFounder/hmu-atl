// Blast draft localStorage helper.
//
// Per docs/BLAST-V3-AGENT-CONTRACT.md §3 D-12: 30-minute TTL, namespaced key,
// validation on load. ALL blast draft persistence must go through this module —
// no direct `window.localStorage` calls anywhere else in Stream A.
//
// Why a separate module? The blast unauth → auth handoff parks the draft in
// localStorage while Clerk completes sign-up/sign-in, then restores it on the
// /auth-callback/blast page. Centralizing the contract here means the TTL,
// key, and validation rules live in exactly one place — bumping TTL or
// changing the schema doesn't risk drift across pages.
//
// PostHog events fired here so the funnel observability is consistent
// regardless of which surface saves/loads/expires the draft.

import type { BlastDraft } from '@/lib/blast/types';

// Namespaced under `hmu.blast.*` so future blast-related local state can sit
// alongside without colliding with the legacy v2 `blast_draft_v2` key (left
// unowned; the v2 form was rebuilt and that key will simply expire on its own).
const DRAFT_KEY = 'hmu.blast.draft';

// 30 minutes per contract D-12. Lower than the v2 1-hour TTL because the v3
// flow includes a username + photo step that adds friction; we'd rather force
// a fresh draft than restore a stale one and silently send the wrong trip.
const DRAFT_TTL_MS = 30 * 60 * 1000;

interface StoredDraft {
  draft: BlastDraft;
  savedAt: number;
}

// Lazy-imported to avoid pulling posthog into bundles that don't need it
// (and to keep this module SSR-safe).
function capture(event: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  // Best-effort fire-and-forget — never block the storage op on analytics.
  import('@/components/analytics/posthog-provider')
    .then(({ posthog }) => {
      try { posthog.capture(event, props); } catch { /* ignore */ }
    })
    .catch(() => { /* ignore */ });
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * Sanity-check a parsed draft so we never restore something that would crash
 * the form. We don't enforce ALL fields are present — the form may legitimately
 * be partway through; we only enforce the shape exists and the few required
 * primitive fields are the right type.
 */
function isValidDraft(d: unknown): d is BlastDraft {
  if (!d || typeof d !== 'object') return false;
  const draft = d as Record<string, unknown>;
  // pickup/dropoff must at least be objects with numeric coords if present.
  // Empty pickup ({}) is not valid — the form treats absence as null, presence
  // as "user picked an address" so { lat: NaN } would render bad UI.
  const checkPoint = (p: unknown): boolean => {
    if (!p || typeof p !== 'object') return false;
    const pp = p as Record<string, unknown>;
    return typeof pp.lat === 'number' && Number.isFinite(pp.lat)
      && typeof pp.lng === 'number' && Number.isFinite(pp.lng)
      && typeof pp.address === 'string';
  };
  if (!checkPoint(draft.pickup)) return false;
  if (!checkPoint(draft.dropoff)) return false;
  if (draft.tripType !== 'one_way' && draft.tripType !== 'round_trip') return false;
  if (typeof draft.storage !== 'boolean') return false;
  if (typeof draft.priceDollars !== 'number' || !Number.isFinite(draft.priceDollars)) return false;
  if (typeof draft.draftCreatedAt !== 'number') return false;
  // driverPreference is { preferred: string[], strict: boolean }
  const dp = draft.driverPreference as Record<string, unknown> | undefined;
  if (!dp || !Array.isArray(dp.preferred) || typeof dp.strict !== 'boolean') return false;
  return true;
}

/**
 * Save the in-progress blast draft. Overwrites any existing draft under the
 * same key. Stamps `savedAt` outside the BlastDraft itself so we don't risk
 * mutating draftCreatedAt (which is a real schema field).
 */
export function saveBlastDraft(draft: BlastDraft): void {
  if (!isBrowser()) return;
  try {
    const payload: StoredDraft = { draft, savedAt: Date.now() };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    // Best-effort signal to the funnel that the draft is now safely parked
    // and Clerk handoff is OK to proceed.
    capture('blast_draft_saved', {
      hasAllRequired: !!(draft.pickup?.address && draft.dropoff?.address && draft.priceDollars),
    });
  } catch {
    // Quota / private mode — degrade silently. The form keeps the draft in
    // memory; the user just loses it if they close the tab.
  }
}

/**
 * Load and clear-on-expire a previously parked draft. Returns null when:
 *   - localStorage is unavailable
 *   - no draft exists
 *   - draft JSON parses but fails the shape check
 *   - draft is past TTL (older than 30min) — also clears it
 *
 * Callers (the auth-callback restore step) treat null as "no draft to restore"
 * and route the user to the empty form.
 */
export function loadBlastDraft(): BlastDraft | null {
  if (!isBrowser()) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — drop it so the next save is clean.
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const stored = parsed as Partial<StoredDraft>;
  if (typeof stored.savedAt !== 'number') return null;

  const ageMs = Date.now() - stored.savedAt;
  if (ageMs > DRAFT_TTL_MS) {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    capture('blast_draft_expired', { ageMs });
    return null;
  }

  if (!isValidDraft(stored.draft)) {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    return null;
  }

  return stored.draft;
}

/**
 * Restore-and-instrument: like `loadBlastDraft` but additionally fires a
 * `blast_draft_restored` PostHog event tagged with the source surface
 * ('signin' or 'signup' as defined by the contract §10). Use from the
 * /auth-callback/blast page; use plain `loadBlastDraft` from the form when
 * rehydrating a still-active draft on initial mount (which is not a "restore"
 * funnel event, just continuity).
 */
export function restoreBlastDraft(source: 'signin' | 'signup'): BlastDraft | null {
  if (!isBrowser()) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let stored: Partial<StoredDraft> | null = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') stored = parsed as Partial<StoredDraft>;
  } catch {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    return null;
  }
  if (!stored || typeof stored.savedAt !== 'number') return null;

  const ageMs = Date.now() - stored.savedAt;
  if (ageMs > DRAFT_TTL_MS) {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    capture('blast_draft_expired', { ageMs });
    return null;
  }
  if (!isValidDraft(stored.draft)) {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    return null;
  }
  capture('blast_draft_restored', { source, ageMs });
  return stored.draft;
}

/**
 * Drop the draft after a successful submit (or an explicit user discard).
 * Idempotent — safe to call when no draft exists.
 */
export function clearBlastDraft(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

// Exported for tests + edge cases (e.g. integration tests that need to assert
// what the helper stored). Treat as internal.
export const __INTERNAL__ = {
  DRAFT_KEY,
  DRAFT_TTL_MS,
  isValidDraft,
};
