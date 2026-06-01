// Booking back-out drafts — persists an in-progress booking so a user who
// leaves a flow mid-way can resume or start over instead of losing everything.
//
// Design rule: this layer is PURELY ADDITIVE and FAIL-SAFE. Every function
// swallows its own errors and returns a benign value, so if AsyncStorage is
// unavailable or the stored blob is corrupt, the booking flows behave exactly
// as they did before (start fresh, save silently no-ops). It must never throw
// into a screen.
//
// TTL is short (5 min) on purpose: a draft is "you stepped away for a second,"
// not a saved order. Past the TTL the draft is treated as absent and cleared.

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'hmu.bookingDraft.';
export const DRAFT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type BookingFlowKey = 'direct' | 'blast' | 'down-bad' | 'delivery';

interface Envelope<T> {
  savedAt: number;
  data: T;
}

function keyFor(flow: BookingFlowKey): string {
  return `${PREFIX}${flow}`;
}

/** Persist the current in-progress booking. Debounce at the call site. */
export async function saveBookingDraft<T>(flow: BookingFlowKey, data: T): Promise<void> {
  try {
    const env: Envelope<T> = { savedAt: Date.now(), data };
    await AsyncStorage.setItem(keyFor(flow), JSON.stringify(env));
  } catch {
    // Storage full / unavailable — silently skip; the flow still works live.
  }
}

/**
 * Return a resumable draft, or null if none / expired / corrupt. Expired or
 * unreadable entries are cleared as a side effect so they can't linger.
 */
export async function loadBookingDraft<T>(flow: BookingFlowKey): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(flow));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env.savedAt !== 'number' || env.data == null) {
      await clearBookingDraft(flow);
      return null;
    }
    if (Date.now() - env.savedAt > DRAFT_TTL_MS) {
      await clearBookingDraft(flow);
      return null;
    }
    return env.data;
  } catch {
    // Corrupt JSON or read error — drop it and start clean.
    await clearBookingDraft(flow);
    return null;
  }
}

/** Remove the draft (on successful submit, or "Start over"). */
export async function clearBookingDraft(flow: BookingFlowKey): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(flow));
  } catch {
    // Non-fatal.
  }
}
