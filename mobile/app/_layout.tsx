import '@/tasks/location-task'; // registers background task at module load — must be first
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet, AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { NotificationProvider } from '@/contexts/notifications';
import { NotificationBanner } from '@/components/NotificationBanner';
import { UserProvider } from '@/contexts/UserContext';

// ─── Biometric lock ───────────────────────────────────────────────────────────
// Shown on cold start and after 5+ minutes in background when signed in.
// Uses Face ID / Touch ID; falls back silently when hardware is absent.

const LOCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes

function BiometricGate({ isSignedIn, children }: { isSignedIn: boolean; children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [biometricType, setBiometricType] = useState<'face' | 'touch' | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);
  const supported = useRef(false);
  // Track whether the user was already signed in when the app cold-started.
  // If false, they just completed OTP — don't prompt biometrics on sign-in.
  const wasSignedInOnMount = useRef<boolean | null>(null);
  const initCalled = useRef(false);

  useEffect(() => {
    // Capture auth state on first evaluation only
    if (wasSignedInOnMount.current === null) {
      wasSignedInOnMount.current = isSignedIn;
    }
    if (!isSignedIn) { setReady(true); return; }
    // Only lock on cold start (already signed in when app launched).
    // Skip when isSignedIn just flipped true after OTP.
    if (!wasSignedInOnMount.current) { setReady(true); return; }
    if (initCalled.current) return;
    initCalled.current = true;
    void init();
  }, [isSignedIn]);

  // Re-lock after returning from background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current === 'active' && next.match(/inactive|background/)) {
        backgroundedAt.current = Date.now();
      }
      if (next === 'active' && backgroundedAt.current !== null) {
        const elapsed = Date.now() - backgroundedAt.current;
        if (elapsed >= LOCK_AFTER_MS && supported.current && isSignedIn) {
          setLocked(true);
          void prompt();
        }
        backgroundedAt.current = null;
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [isSignedIn]);

  async function init() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHardware && isEnrolled) {
      supported.current = true;
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      setBiometricType(
        types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'face' : 'touch',
      );
      setLocked(true);
      await prompt();
    }
    setReady(true);
  }

  async function prompt() {
    setAuthenticating(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock HMU ATL',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      });
      if (result.success) setLocked(false);
    } finally {
      setAuthenticating(false);
    }
  }

  if (!ready) return <View style={bl.root} />;

  if (locked) {
    return (
      <View style={bl.root}>
        <View style={bl.logoWrap}>
          <Text style={bl.logo}>HMU</Text>
          <Text style={bl.logoSub}>ATL</Text>
        </View>
        <View style={bl.center}>
          <TouchableOpacity style={bl.iconBtn} onPress={prompt} disabled={authenticating} activeOpacity={0.7}>
            <Text style={bl.icon}>{biometricType === 'face' ? '🔐' : '👆'}</Text>
          </TouchableOpacity>
          <Text style={bl.label}>{authenticating ? 'Authenticating…' : biometricType === 'face' ? 'Use Face ID to unlock' : 'Use Touch ID to unlock'}</Text>
          {!authenticating && (
            <TouchableOpacity onPress={prompt} style={bl.retryBtn}>
              <Text style={bl.retryText}>Try Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const bl = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  logoWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 80, paddingLeft: 32 },
  logo: { fontFamily: 'BebasNeue_400Regular', fontSize: 48, color: '#00E676', letterSpacing: 3 },
  logoSub: { fontFamily: 'SpaceMono_400Regular', fontSize: 16, color: '#555', letterSpacing: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  iconBtn: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(0,230,118,0.10)', borderWidth: 1, borderColor: 'rgba(0,230,118,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 40 },
  label: { fontFamily: 'SpaceMono_400Regular', fontSize: 13, color: '#888', letterSpacing: 0.5, textAlign: 'center' },
  retryBtn: { paddingVertical: 8, paddingHorizontal: 24 },
  retryText: { fontFamily: 'DMSans_500Medium', fontSize: 14, color: '#00E676' },
});

// StripeProvider must live at the app root so native module initializes before
// any payment screen mounts — screen-scoped providers cause a race condition
// where initPaymentSheet fires before the native SDK has processed the key.
let StripeProvider: typeof import('@stripe/stripe-react-native').StripeProvider | null = null;
try {
  StripeProvider = require('@stripe/stripe-react-native').StripeProvider;
} catch {
  // Expo Go or missing native build — payment screens show their own fallback UI
}

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
console.log('[stripe] publishable key prefix:', stripePublishableKey ? stripePublishableKey.slice(0, 20) + '...' : 'MISSING — EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is empty');

const tokenCache = {
  async getToken(key: string) { return SecureStore.getItemAsync(key); },
  async saveToken(key: string, value: string) { return SecureStore.setItemAsync(key, value); },
};

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isLoaded) return;
    const inAuth = segments[0] === '(auth)';
    if (!isSignedIn && !inAuth) {
      router.replace('/(auth)/sign-in');
    } else if (isSignedIn && inAuth) {
      router.replace('/');
    }
  }, [isLoaded, isSignedIn, segments]);

  return (
    <BiometricGate isSignedIn={!!isSignedIn}>
      <NotificationProvider>
        <View style={{ flex: 1 }}>
          <Slot />
          <NotificationBanner />
        </View>
      </NotificationProvider>
    </BiometricGate>
  );
}

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? Constants.expoConfig?.extra?.clerkPublishableKey ?? '';

function AppProviders() {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <UserProvider>
        <StatusBar style="light" />
        <AuthGate />
      </UserProvider>
    </ClerkProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#080808' }} />;
  }

  if (StripeProvider) {
    return (
      <StripeProvider
        publishableKey={stripePublishableKey}
        merchantIdentifier="merchant.com.hmupickup"
        urlScheme="hmuatl"
      >
        <AppProviders />
      </StripeProvider>
    );
  }

  return <AppProviders />;
}
