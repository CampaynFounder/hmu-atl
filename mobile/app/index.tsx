// Auth gate: fetch /api/users/me to read profileType, then route to correct tab root.
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
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
        } else if (me.profileType === 'driver') {
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
