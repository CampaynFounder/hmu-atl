// Carries the rider's validated pickup / dropoff / stops from the booking flow
// to the Pull-Up screen, so the trip is entered ONCE. Booking stashes the full
// validated addresses (coords included); Pull-Up prefills from it and clears it
// on COO. Mobile-only and fail-safe — mirrors lib/booking-draft.ts: every
// function swallows its own errors so a storage hiccup just falls back to the
// old "enter it again" behaviour rather than throwing into a screen.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ValidatedAddress } from '@/components/AddressInput';

const KEY = 'hmu.pendingRideLocations';
// Covers the 15-min direct-booking acceptance window plus slack (the rider may
// pull up a little after the driver accepts).
const TTL_MS = 30 * 60 * 1000;

export interface PendingRideLocations {
  pickup: ValidatedAddress | null;
  dropoff: ValidatedAddress | null;
  stops: ValidatedAddress[];
  /** Sanity tag — which driver this trip was booked with. */
  driverHandle?: string;
}

interface Envelope {
  savedAt: number;
  data: PendingRideLocations;
}

export async function savePendingRideLocations(data: PendingRideLocations): Promise<void> {
  try {
    const env: Envelope = { savedAt: Date.now(), data };
    await AsyncStorage.setItem(KEY, JSON.stringify(env));
  } catch {
    // Storage full / unavailable — Pull-Up just falls back to manual entry.
  }
}

export async function loadPendingRideLocations(): Promise<PendingRideLocations | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope;
    if (!env || typeof env.savedAt !== 'number' || env.data == null) {
      await clearPendingRideLocations();
      return null;
    }
    if (Date.now() - env.savedAt > TTL_MS) {
      await clearPendingRideLocations();
      return null;
    }
    return {
      pickup: env.data.pickup ?? null,
      dropoff: env.data.dropoff ?? null,
      stops: Array.isArray(env.data.stops) ? env.data.stops.filter(Boolean) : [],
      driverHandle: env.data.driverHandle,
    };
  } catch {
    await clearPendingRideLocations();
    return null;
  }
}

export async function clearPendingRideLocations(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Non-fatal.
  }
}
