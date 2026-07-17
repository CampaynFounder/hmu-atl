// Reads/writes the PUBLIC @handle of the App Store reviewer demo accounts
// (driver +1 404 696 5907, rider +1 404 696 5908). These are real user rows —
// unlike the fake financials/history in lib/demo/data.ts — so the handle lives
// in driver_profiles.handle / rider_profiles.handle and is what riders/drivers
// actually see. Superadmin edits it from /admin/demo-data.

import { sql } from '@/lib/db/client';
import { demoPhones10 } from './phones';
import { normalizeHandle, isHandleTaken, HANDLE_ERROR } from '@/lib/profile/handle';

export type DemoRole = 'driver' | 'rider';

export interface DemoUserHandle {
  role: DemoRole;
  userId: string | null;       // null when no demo account of this role is provisioned
  handle: string | null;
  displayName: string | null;
}

export interface DemoHandles {
  driver: DemoUserHandle;
  rider: DemoUserHandle;
}

// Look up the demo driver + rider by their configured phones and return the
// current public handle for each. Returns empty (userId: null) slots when
// DEMO_LOGIN_PHONE is unset or the accounts haven't been provisioned.
export async function getDemoUserHandles(): Promise<DemoHandles> {
  const driver: DemoUserHandle = { role: 'driver', userId: null, handle: null, displayName: null };
  const rider: DemoUserHandle = { role: 'rider', userId: null, handle: null, displayName: null };

  const phones = demoPhones10();
  if (!phones.length) return { driver, rider };

  const rows = await sql`
    SELECT u.id, u.profile_type,
           CASE WHEN u.profile_type = 'driver' THEN dp.handle ELSE rp.handle END AS handle,
           CASE WHEN u.profile_type = 'driver' THEN dp.display_name ELSE rp.display_name END AS display_name
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(u.phone, ''), '[^0-9]', '', 'g'), 10) = ANY(${phones})
  `;

  for (const r of rows as Array<{ id: string; profile_type: string; handle: string | null; display_name: string | null }>) {
    const slot = r.profile_type === 'driver' ? driver : r.profile_type === 'rider' ? rider : null;
    if (slot && !slot.userId) {
      slot.userId = r.id;
      slot.handle = r.handle;
      slot.displayName = r.display_name;
    }
  }
  return { driver, rider };
}

export type SetDemoHandleResult =
  | { ok: true; handles: DemoHandles }
  | { ok: false; error: string; status: number };

// Validate + uniqueness-check + persist a new public handle for the demo
// account of `role`. Uses the shared handle rules so it behaves exactly like
// the admin user editor. Never touches non-demo accounts.
export async function setDemoUserHandle(role: DemoRole, rawHandle: unknown): Promise<SetDemoHandleResult> {
  if (typeof rawHandle !== 'string') {
    return { ok: false, error: 'handle (string) is required', status: 400 };
  }
  const normalized = normalizeHandle(rawHandle);
  if (!normalized) return { ok: false, error: HANDLE_ERROR, status: 400 };

  const handles = await getDemoUserHandles();
  const target = handles[role];
  if (!target.userId) {
    return {
      ok: false,
      status: 404,
      error: `No demo ${role} account found. Set DEMO_LOGIN_PHONE and provision the demo accounts first.`,
    };
  }

  if (await isHandleTaken(normalized, target.userId)) {
    return { ok: false, error: `Handle "${normalized}" is already taken`, status: 409 };
  }

  if (role === 'driver') {
    await sql`UPDATE driver_profiles SET handle = ${normalized} WHERE user_id = ${target.userId}`;
  } else {
    await sql`UPDATE rider_profiles SET handle = ${normalized} WHERE user_id = ${target.userId}`;
  }

  return { ok: true, handles: await getDemoUserHandles() };
}
