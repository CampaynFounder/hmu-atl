// Maintenance mode — admin-toggled switch that blocks non-admin access
// to authenticated routes and routes everyone to /maintenance with a
// branded message + "notify me when back" waitlist form.
//
// Middleware reads state per request via getStateCached. The 30s module-
// level TTL keeps the DB round-trip rare (~1 query per isolate per 30s)
// while still picking up admin toggles within a reasonable window.
// Fail-open: any DB error returns { enabled: false } so a Neon hiccup
// can never black-hole the whole app.

import { sql } from '@/lib/db/client';

export interface MaintenanceState {
  enabled: boolean;
  title: string;
  body: string;
  expected_return_at: Date | null;
  updated_at: Date;
}

export interface MaintenanceStateInput {
  enabled: boolean;
  title: string;
  body: string;
  expected_return_at: Date | string | null;
}

const DEFAULT_STATE: MaintenanceState = {
  enabled: false,
  title: '',
  body: '',
  expected_return_at: null,
  updated_at: new Date(0),
};

let cache: { state: MaintenanceState; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

async function loadState(): Promise<MaintenanceState> {
  const rows = await sql`
    SELECT enabled, title, body, expected_return_at, updated_at
    FROM maintenance_mode WHERE id = 1 LIMIT 1
  `;
  const r = rows[0] as MaintenanceState | undefined;
  return r ?? DEFAULT_STATE;
}

export async function getStateCached(): Promise<MaintenanceState> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.state;
  try {
    const state = await loadState();
    cache = { state, fetchedAt: Date.now() };
    return state;
  } catch (err) {
    console.error('[maintenance/getStateCached] falling back to disabled:', err);
    return DEFAULT_STATE;
  }
}

// Force a fresh read — admin UI after a mutation + writes must see updates
// instantly without waiting 30s for the cache to expire.
export async function getStateFresh(): Promise<MaintenanceState> {
  const state = await loadState();
  cache = { state, fetchedAt: Date.now() };
  return state;
}

export async function updateState(
  input: MaintenanceStateInput,
  adminId: string,
): Promise<MaintenanceState> {
  const rows = await sql`
    UPDATE maintenance_mode
    SET
      enabled = ${input.enabled},
      title = ${input.title},
      body = ${input.body},
      expected_return_at = ${input.expected_return_at ? new Date(input.expected_return_at).toISOString() : null},
      updated_at = NOW(),
      updated_by = ${adminId}
    WHERE id = 1
    RETURNING enabled, title, body, expected_return_at, updated_at
  `;
  const state = rows[0] as MaintenanceState;
  cache = { state, fetchedAt: Date.now() };
  return state;
}

// Wipe the cache in this isolate. Only useful if multiple pieces of code
// mutate state within the same request.
export function invalidateCache(): void {
  cache = null;
}

// ────────────────────────────────────────────────────────────────────
// Waitlist
// ────────────────────────────────────────────────────────────────────

export interface WaitlistEntry {
  id: string;
  phone: string;
  user_id: string | null;
  created_at: Date;
  notified_at: Date | null;
  notified_count: number;
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

export async function joinWaitlist(rawPhone: string, userId: string | null = null): Promise<
  { ok: true; entry: WaitlistEntry } | { ok: false; error: string }
> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: 'invalid phone' };

  const rows = await sql`
    INSERT INTO maintenance_waitlist (phone, user_id)
    VALUES (${phone}, ${userId})
    ON CONFLICT (phone) DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, maintenance_waitlist.user_id)
    RETURNING id, phone, user_id, created_at, notified_at, notified_count
  `;
  return { ok: true, entry: rows[0] as WaitlistEntry };
}

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  return (await sql`
    SELECT id, phone, user_id, created_at, notified_at, notified_count
    FROM maintenance_waitlist
    ORDER BY created_at DESC
    LIMIT 500
  `) as WaitlistEntry[];
}

export async function listUnnotified(): Promise<WaitlistEntry[]> {
  return (await sql`
    SELECT id, phone, user_id, created_at, notified_at, notified_count
    FROM maintenance_waitlist
    WHERE notified_at IS NULL
    ORDER BY created_at ASC
  `) as WaitlistEntry[];
}

export async function markNotified(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await sql`
    UPDATE maintenance_waitlist
    SET notified_at = NOW(), notified_count = notified_count + 1
    WHERE id = ANY(${ids}::uuid[])
    RETURNING id
  `;
  return rows.length;
}

export interface WaitlistStats {
  total: number;
  unnotified: number;
  notified: number;
}

export async function getWaitlistStats(): Promise<WaitlistStats> {
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE notified_at IS NULL)::int AS unnotified,
      COUNT(*) FILTER (WHERE notified_at IS NOT NULL)::int AS notified
    FROM maintenance_waitlist
  `;
  const r = rows[0] as WaitlistStats;
  return r;
}
