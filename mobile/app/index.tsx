// Auth gate: fetch /api/users/me to read profileType, then route to correct tab root.
// Also runs a geo-based market check after auth — inactive markets show the coming-soon screen.
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import * as Location from 'expo-location';
import { apiClient } from '@/lib/api';

export default function Index() {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    if (!isSignedIn) return;

    async function resolve() {
      try {
        const token = await getToken();
        const me = await apiClient<{ profileType: string; accountStatus: string }>(
          '/users/me', token,
        );
        if (me.accountStatus === 'pending') {
          router.replace('/(auth)/pending');
          return;
        }

        // Geo-based market check — skipped in dev builds to avoid simulator location issues.
        // In production, fails open on denied permission or API error.
        if (!__DEV__) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              const loc = await Promise.race([
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
                new Promise<null>((res) => setTimeout(() => res(null), 4000)),
              ]);
              if (loc) {
                const market = await apiClient<{ isActive: boolean; displayName: string; marketSlug: string | null }>(
                  `/markets/active-check?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`,
                  token,
                );
                if (market.isActive === false) {
                  router.replace({
                    pathname: '/not-in-market',
                    params: { area: market.displayName ?? 'Your area', slug: market.marketSlug ?? '' },
                  } as never);
                  return;
                }
              }
            }
          } catch {
            // Proceed normally if location or market check fails
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
