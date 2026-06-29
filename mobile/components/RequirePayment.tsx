// Full-screen payment gate for the booking screens. Wrap a booking flow's
// content in <RequirePayment> so a rider who reached it through ANY route
// (home card, Browse "HMU", a deep link) must link a card before the form
// mounts. Renders the SAME PaymentGateCard the home screen uses.
//
// Children only mount once the rider is allowed through, so the wrapped screen's
// hooks/effects (e.g. direct-booking's prefill loader) never run while gated.
// Re-checks on focus, so returning from payment-setup reveals the form in place.
import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '@/lib/theme';
import { useHasPaymentMethod } from '@/hooks/use-payment-method';
import { PaymentGateCard } from '@/components/PaymentGate';

export function RequirePayment({ children }: { children: ReactNode }) {
  const { loading, hasMethod } = useHasPaymentMethod();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (loading) {
    return (
      <View style={[s.root, s.centerFill]}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  // Gate ONLY on a confirmed-empty result; unknown (null) falls through to the
  // form, matching the home gate (server still enforces a card at capture).
  if (hasMethod === false) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>ADD PAYMENT</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.content}>
          <PaymentGateCard />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  centerFill: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, letterSpacing: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
});
