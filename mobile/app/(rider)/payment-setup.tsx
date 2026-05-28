// Payment setup — wraps Stripe CardField + SetupIntent flow.
// Requires a native build that includes @stripe/stripe-react-native.
// Falls back gracefully on dev builds that predate the native rebuild.

import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

// Guard: Stripe's TurboModule crashes if native binary doesn't include it.
// Wrap the require so the module can still load on older dev builds.
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

  const { StripeProvider } = StripeModule;
  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}
      merchantIdentifier="merchant.com.hmucashride"
      urlScheme="hmuatl"
    >
      <PaymentSetupInner />
    </StripeProvider>
  );
}

function PaymentSetupInner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  // These are only called when StripeModule is defined, so safe to require here
  const { useStripe, CardField } = StripeModule!;
  const { confirmSetupIntent } = useStripe();

  const [cardComplete, setCardComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!cardComplete || loading) return;
    setLoading(true);
    setError(null);
    try {
      const t = await getToken();
      const { clientSecret } = await apiClient<{ clientSecret: string }>(
        '/rider/payment-methods/setup-intent', t, { method: 'POST' },
      );
      const { setupIntent, error: stripeError } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: 'Card',
      });
      if (stripeError) throw new Error(stripeError.message);
      if (!setupIntent?.paymentMethodId) throw new Error('No payment method returned');
      await apiClient('/rider/payment-methods/save', t, {
        method: 'POST',
        body: JSON.stringify({ paymentMethodId: setupIntent.paymentMethodId }),
      });
      setSuccess(true);
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>PAYMENT METHOD</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
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

            <Animated.View entering={FadeInUp.delay(150).duration(400)} style={[s.cardWrap, shadow.card]}>
              <Text style={s.fieldLabel}>CARD DETAILS</Text>
              <CardField
                postalCodeEnabled={false}
                onCardChange={(details: any) => setCardComplete(details.complete)}
                style={s.cardField}
                cardStyle={{
                  backgroundColor: colors.cardAlt,
                  textColor: colors.textPrimary,
                  placeholderColor: colors.textFaint,
                  borderColor: colors.borderStrong,
                  borderWidth: 1,
                  borderRadius: radius.cardInner,
                  fontSize: 16,
                }}
              />
            </Animated.View>

            {error && (
              <Animated.View entering={FadeIn.duration(300)} style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
                <Text style={s.errorText}>{error}</Text>
              </Animated.View>
            )}

            <Animated.View entering={FadeInUp.delay(250).duration(400)}>
              <TouchableOpacity
                style={[s.saveBtn, (!cardComplete || loading) && s.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!cardComplete || loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color={colors.bg} /> : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.bg} />
                    <Text style={s.saveBtnText}>SAVE CARD</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            <Text style={s.secureNote}>Secured by Stripe · Card number never stored on HMU servers</Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  cardWrap: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong,
  },
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.md },
  cardField: { width: '100%', height: 54 },
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
