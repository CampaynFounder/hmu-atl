// Auth gate: fetch /api/users/me to read profileType + isSuperAdmin, then route.
// Also runs a geo-based market check after auth — inactive markets show the coming-soon screen.
//
// Returning users skip the spinner entirely: we cache the last resolved home
// route per Clerk user and optimistically jump straight there on next launch,
// then re-verify in the background and correct course only if something changed
// (pending/deleted/onboarding/market). First launch (no cache) is unchanged.
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import * as Location from 'expo-location';
import { apiClient } from '@/lib/api';
import { useUserContext } from '@/contexts/UserContext';

// Cap the startup gate calls well below the default 30s so a stalled origin
// falls back fast (cached route or sign-in) instead of hanging the launch.
const GATE_TIMEOUT_MS = 8000;
const routeCacheKey = (uid: string) => `route_cache_v1:${uid}`;
type HomeRoute = '/(driver)/home' | '/(rider)/home';

export default function Index() {
  const { isSignedIn, userId, signOut } = useAuth();
  const getToken = useStableToken();
  const router = useRouter();
  const { setUser } = useUserContext();

  useEffect(() => {
    if (!isSignedIn) return;

    let cancelled = false;
    let optimisticallyRouted = false;
    let optimisticRoute: HomeRoute | null = null;

    const clearCache = () => {
      if (userId) AsyncStorage.removeItem(routeCacheKey(userId)).catch(() => {});
    };

    async function resolve() {
      try {
        const token = await getToken();
        const me = await apiClient<{
          profileType: string;
          accountStatus: string;
          isSuperAdmin?: boolean;
          isDemo?: boolean;
          accountDeletionEnabled?: boolean;
        }>('/users/me', token, {}, { timeoutMs: GATE_TIMEOUT_MS });

        if (me.accountStatus === 'pending') {
          clearCache();
          router.replace('/(auth)/pending');
          return;
        }

        // Account was deleted (e.g. from another device, or the Clerk delete
        // raced ahead of this session). Sign out and bounce to sign-in — a fresh
        // sign-up creates a brand-new account.
        if (me.accountStatus === 'deleted') {
          clearCache();
          await signOut();
          router.replace('/(auth)/sign-in');
          return;
        }

        // Populate global user context so profile screens can access isSuperAdmin
        // + the account-deletion kill-switch (fail open: only an explicit false hides it).
        setUser({
          profileType: me.profileType,
          isSuperAdmin: !!me.isSuperAdmin,
          accountDeletionEnabled: me.accountDeletionEnabled !== false,
        });

        // Run the two independent post-auth gates CONCURRENTLY instead of in a
        // serial waterfall (this used to add up to 4s of geolocation + a second
        // round-trip before home rendered):
        //  1. Geo-based market check — bounce users physically outside an active
        //     market to the coming-soon screen. Skipped in dev + for demo accounts;
        //     fails open on denied permission / error. Geo capped at 1.5s.
        //  2. Onboarding check — catch users who picked a role but never finished.
        type MarketGate = { isActive: boolean; displayName: string; marketSlug: string | null } | null;
        const marketCheck = async (): Promise<MarketGate> => {
          if (__DEV__ || me.isDemo) return null;
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return null;
            const loc = await Promise.race([
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }),
              new Promise<null>((res) => setTimeout(() => res(null), 1500)),
            ]);
            if (!loc) return null;
            return await apiClient<{ isActive: boolean; displayName: string; marketSlug: string | null }>(
              `/markets/active-check?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`, token,
              {}, { timeoutMs: GATE_TIMEOUT_MS },
            );
          } catch { return null; }
        };
        const onboardingCheck = async () => {
          try {
            return await apiClient<{
              needsRiderProfile: boolean; needsDriverProfile: boolean;
              hasRiderProfile: boolean; hasDriverProfile: boolean;
            }>('/users/onboarding', token, {}, { timeoutMs: GATE_TIMEOUT_MS });
          } catch { return null; }
        };

        const [market, onb] = await Promise.all([marketCheck(), onboardingCheck()]);

        // Market gate takes precedence (unchanged order of authority).
        if (market && market.isActive === false) {
          clearCache();
          router.replace({
            pathname: '/not-in-market',
            params: { area: market.displayName ?? 'Your area', slug: market.marketSlug ?? '' },
          } as never);
          return;
        }

        // Onboarding gate — brand-new account (no profile of either type) → picker.
        if (onb) {
          if (!onb.hasRiderProfile && !onb.hasDriverProfile) {
            clearCache();
            router.replace('/(auth)/choose-role' as any);
            return;
          }
          if (me.profileType === 'driver' && onb.needsDriverProfile) {
            clearCache();
            router.replace('/(driver)/onboarding' as any);
            return;
          }
          if (me.profileType === 'rider' && onb.needsRiderProfile) {
            clearCache();
            router.replace('/(rider)/onboarding' as any);
            return;
          }
        }

        // Happy path — cache this decision so next launch skips the spinner. Only
        // navigate if we aren't already there (skips a redundant re-nav when the
        // optimistic route was already correct, i.e. the common returning-user case).
        const homeRoute: HomeRoute = me.profileType === 'driver' ? '/(driver)/home' : '/(rider)/home';
        if (userId) AsyncStorage.setItem(routeCacheKey(userId), homeRoute).catch(() => {});
        if (optimisticRoute !== homeRoute) router.replace(homeRoute);
      } catch {
        // Verify failed (offline / stalled origin). If we already optimistically
        // landed on home from cache, STAY there — the home screens handle their
        // own load errors, and bouncing a returning user to sign-in would be a
        // regression. Only a first launch (no cached route) falls back to
        // sign-in, exactly as before.
        if (!optimisticallyRouted && !cancelled) router.replace('/(auth)/sign-in');
      }
    }

    // Optimistic fast path: if this user has a cached home route, jump there
    // immediately (no spinner), then verify in the background via resolve().
    (async () => {
      try {
        if (userId) {
          const cached = await AsyncStorage.getItem(routeCacheKey(userId));
          if (!cancelled && (cached === '/(driver)/home' || cached === '/(rider)/home')) {
            optimisticallyRouted = true;
            optimisticRoute = cached as HomeRoute;
            router.replace(cached as HomeRoute);
          }
        }
      } catch { /* fall through to normal resolve */ }
      if (!cancelled) void resolve();
    })();

    return () => { cancelled = true; };
  }, [isSignedIn]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#00E676" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
});
