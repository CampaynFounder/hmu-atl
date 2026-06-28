// Payment setup — uses Stripe PaymentSheet (SetupIntent flow).
// PaymentSheet is the correct API for automatic_payment_methods SetupIntents
// and supports Apple Pay, Google Pay, Cash App Pay, and cards automatically.
// Requires a native build that includes @stripe/stripe-react-native.
// StripeProvider lives in the root layout (_layout.tsx) — not here.

import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

let StripeModule: typeof import('@stripe/stripe-react-native') | null = null;
try {
  StripeModule = require('@stripe/stripe-react-native') as typeof import('@stripe/stripe-react-native');
} catch {
  console.warn('[payment-setup] @stripe/stripe-react-native native module not available — run expo run:ios to enable');
}

export default function PaymentSetup() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (!StripeModule) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>PAYMENT METHOD</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.rebuild}>
          <Ionicons name="build-outline" size={40} color={colors.textFaint} />
          <Text style={s.rebuildTitle}>NATIVE BUILD REQUIRED</Text>
          <Text style={s.rebuildBody}>
            Payment setup needs a fresh native build that includes the Stripe SDK.{'\n\n'}
            Run this in your terminal:{'\n'}
          </Text>
          <View style={s.codeBlock}>
            <Text style={s.code}>npx expo run:ios</Text>
          </View>
        </View>
      </View>
    );
  }

  // StripeProvider is at the root layout — no need to re-wrap here.
  return <PaymentSetupInner />;
}

function PaymentSetupInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const getToken = useStableToken();

  const { usePaymentSheet } = StripeModule!;
  const { initPaymentSheet, presentPaymentSheet, loading: sheetLoading } = usePaymentSheet();
  // sheetLoading is true while initPaymentSheet/presentPaymentSheet are in-flight

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      try {
        const t = await getToken();
        let cs: string;
        try {
          const resp = await apiClient<{ clientSecret: string }>(
            '/rider/payment-methods/setup-intent', t, { method: 'POST' },
          );
          cs = resp.clientSecret;
        } catch (apiErr: any) {
          console.error('[payment-setup] setup-intent API failed:', apiErr?.message);
          if (!cancelled) setError(apiErr?.message ?? 'Failed to create payment session');
          return;
        }
        if (cancelled) return;

        const { error: initError } = await initPaymentSheet({
          setupIntentClientSecret: cs,
          merchantDisplayName: 'HMU ATL',
          returnURL: 'hmuatl://payment-setup',
          applePay: { merchantCountryCode: 'US' },
          googlePay: { merchantCountryCode: 'US', testEnv: false },
          style: 'alwaysDark',
          appearance: {
            colors: {
              primary: '#00E676',
              background: '#141414',
              componentBackground: '#1a1a1a',
              componentBorder: '#FFFFFF1F',
              componentDivider: '#FFFFFF14',
              primaryText: '#ffffff',
              secondaryText: '#888888',
              componentText: '#ffffff',
              placeholderText: '#555555',
              icon: '#888888',
              error: '#FF5252',
            },
            primaryButton: {
              colors: {
                background: '#00E676',
                text: '#080808',
                border: '#00E676',
              },
              shapes: { borderRadius: 100 },
            },
            shapes: { borderRadius: 12 },
          },
        });

        if (initError) {
          console.error('[payment-setup] initPaymentSheet failed:', initError.code, initError.message);
          if (!cancelled) setError(`[${initError.code}] ${initError.message ?? 'Failed to initialize payment'}`);
          return;
        }

        if (!cancelled) {
          setClientSecret(cs);
          setReady(true);
        }
      } catch (e: any) {
        console.error('[payment-setup] unexpected error:', e?.message);
        if (!cancelled) setError(e.message ?? 'Failed to initialize payment');
      }
    }
    setup();
    return () => { cancelled = true; };
  }, []);

  async function handlePresent() {
    if (!ready || loading || sheetLoading) return;
    setLoading(true);
    setError(null);
    try {
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        // User cancelled — not an error worth showing
        if (presentError.code !== 'Canceled') {
          setError(presentError.message ?? 'Payment setup failed');
        }
        setLoading(false);
        return;
      }

      // PaymentSheet succeeded — save PM to DB via client secret
      const t = await getToken();
      await apiClient('/rider/payment-methods/complete-setup', t, {
        method: 'POST',
        body: JSON.stringify({ setupIntentClientSecret: clientSecret }),
      });

      setSuccess(true);
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>PAYMENT METHOD</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {success ? (
          <Animated.View entering={ZoomIn.duration(400)} style={s.successWrap}>
            <View style={s.successIcon}>
              <Ionicons name="checkmark-circle" size={56} color={colors.green} />
            </View>
            <Text style={s.successTitle}>CARD LINKED</Text>
            <Text style={s.successBody}>You're all set. Let's book a ride.</Text>
          </Animated.View>
        ) : (
          <>
            <Animated.View entering={FadeIn.duration(400)} style={s.infoCard}>
              <Ionicons name="lock-closed-outline" size={16} color={colors.textFaint} />
              <Text style={s.infoText}>
                HMU holds your payment when a driver accepts. You're only charged at pickup.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(150).duration(400)} style={[s.methodCard, shadow.card]}>
              <Text style={s.methodLabel}>ACCEPTED METHODS</Text>
              <View style={s.methods}>
                {(['Apple Pay', 'Google Pay', 'Debit/Credit'] as const).map((m, i) => (
                  <View key={m} style={s.methodChip}>
                    <Ionicons
                      name={i === 0 ? 'logo-apple' : i === 1 ? 'logo-google' : 'card-outline'}
                      size={13}
                      color={colors.textTertiary}
                    />
                    <Text style={s.methodChipText}>{m}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            {error && (
              <Animated.View entering={FadeIn.duration(300)} style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
                <Text style={s.errorText}>{error}</Text>
              </Animated.View>
            )}

            <Animated.View entering={FadeInUp.delay(250).duration(400)}>
              <TouchableOpacity
                style={[s.saveBtn, (!ready || loading || sheetLoading) && s.saveBtnDisabled]}
                onPress={handlePresent}
                disabled={!ready || loading || sheetLoading}
                activeOpacity={0.85}
              >
                {(loading || sheetLoading || (!ready && !error)) ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <>
                    <Ionicons name="add-circle-outline" size={16} color={colors.bg} />
                    <Text style={s.saveBtnText}>ADD PAYMENT METHOD</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            <Text style={s.secureNote}>Secured by Stripe · Card number never stored on HMU servers</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, letterSpacing: 1.5 },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 48 },
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  infoText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },
  methodCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong,
    gap: spacing.md,
  },
  methodLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  methodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.cardAlt, borderRadius: radius.tag,
    paddingHorizontal: spacing.md, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.border,
  },
  methodChipText: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.tag,
    padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder,
  },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.red },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.green,
    borderRadius: radius.pill, paddingVertical: 16,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.bg, letterSpacing: 1.5 },
  secureNote: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, textAlign: 'center', lineHeight: 16 },
  successWrap: { alignItems: 'center', gap: spacing.md, paddingTop: 80 },
  successIcon: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.greenDim, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  successTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.green, letterSpacing: 2 },
  successBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary },
  rebuild: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  rebuildTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textSecondary, letterSpacing: 1.5 },
  rebuildBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 22 },
  codeBlock: {
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  code: { fontFamily: fonts.mono, fontSize: 13, color: colors.green },
});
