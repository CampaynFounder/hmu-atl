// Auth gate: fetch /api/users/me to read profileType + isSuperAdmin, then route.
// Also runs a geo-based market check after auth — inactive markets show the coming-soon screen.
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import * as Location from 'expo-location';
import { apiClient } from '@/lib/api';
import { useUserContext } from '@/contexts/UserContext';

export default function Index() {
  const { isSignedIn, signOut } = useAuth();
  const getToken = useStableToken();
  const router = useRouter();
  const { setUser } = useUserContext();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (!isSignedIn) return;

    async function resolve() {
      try {
        const token = await getToken();
        const me = await apiClient<{
          profileType: string;
          accountStatus: string;
          isSuperAdmin?: boolean;
          isDemo?: boolean;
          accountDeletionEnabled?: boolean;
        }>('/users/me', token);

        if (me.accountStatus === 'pending') {
          router.replace('/(auth)/pending');
          return;
        }

        // Account was deleted (e.g. from another device, or the Clerk delete
        // raced ahead of this session). Sign out and bounce to sign-in — a fresh
        // sign-up creates a brand-new account.
        if (me.accountStatus === 'deleted') {
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
            );
          } catch { return null; }
        };
        const onboardingCheck = async () => {
          try {
            return await apiClient<{
              needsRiderProfile: boolean; needsDriverProfile: boolean;
              hasRiderProfile: boolean; hasDriverProfile: boolean;
            }>('/users/onboarding', token);
          } catch { return null; }
        };

        const [market, onb] = await Promise.all([marketCheck(), onboardingCheck()]);

        // Market gate takes precedence (unchanged order of authority).
        if (market && market.isActive === false) {
          router.replace({
            pathname: '/not-in-market',
            params: { area: market.displayName ?? 'Your area', slug: market.marketSlug ?? '' },
          } as never);
          return;
        }

        // Onboarding gate — brand-new account (no profile of either type) → picker.
        if (onb) {
          if (!onb.hasRiderProfile && !onb.hasDriverProfile) {
            router.replace('/(auth)/choose-role' as any);
            return;
          }
          if (me.profileType === 'driver' && onb.needsDriverProfile) {
            router.replace('/(driver)/onboarding' as any);
            return;
          }
          if (me.profileType === 'rider' && onb.needsRiderProfile) {
            router.replace('/(rider)/onboarding' as any);
            return;
          }
        }

        if (me.profileType === 'driver') {
          router.replace('/(driver)/home');
        } else {
          router.replace('/(rider)/home');
        }
      } catch {
        router.replace('/(auth)/sign-in');
      } finally {
        setResolving(false);
      }
    }

    void resolve();
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
