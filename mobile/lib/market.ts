// Pre-auth market resolution for sign-up. The phone-entry step has no Clerk
// session yet, so this calls the PUBLIC /public/market-check endpoint (null
// token) with the device location. Used to (1) gate sign-up to live markets and
// (2) stamp the correct market slug into Clerk unsafeMetadata before
// signUp.create() so the webhook sets users.market_id at row creation.
import * as Location from 'expo-location';
import { apiClient } from '@/lib/api';

export interface SignupMarket {
  isActive: boolean;
  marketSlug: string | null;
  displayName: string;
}

// Resolve the device's market for sign-up. Returns null when location can't be
// determined (permission denied or timeout) — callers should fail OPEN in that
// case (allow sign-up; the authed launch-time gate in app/index.tsx still
// applies on next open). Never throws.
export async function resolveSignupMarket(phone: string): Promise<SignupMarket | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise<null>((res) => setTimeout(() => res(null), 6000)),
    ]);
    if (!loc) return null;

    const q = `lat=${loc.coords.latitude}&lng=${loc.coords.longitude}&phone=${encodeURIComponent(phone)}`;
    return await apiClient<SignupMarket>(`/public/market-check?${q}`, null);
  } catch {
    return null;
  }
}
