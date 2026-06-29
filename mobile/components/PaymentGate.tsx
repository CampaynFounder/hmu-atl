import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { useHasPaymentMethod } from '@/hooks/use-payment-method';

interface Props {
  children: ReactNode;
}

// The shared "add a card" card — reused by the home gate (this file) and the
// per-screen <RequirePayment> wrapper so the rider sees ONE consistent,
// professional surface everywhere, not the old mis-proportioned onboarding card.
export function PaymentGateCard() {
  const router = useRouter();
  return (
    <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[s.gateCard, shadow.card]}>
      <View style={s.gateIcon}>
        <Ionicons name="card-outline" size={32} color={colors.textFaint} />
      </View>
      <Text style={s.gateTitle}>LINK A PAYMENT METHOD</Text>
      <Text style={s.gateBody}>
        Add a card before you can book. HMU holds payment when your driver accepts — you&apos;re never charged until pickup.
      </Text>
      <TouchableOpacity
        style={s.gateBtn}
        onPress={() => router.push('/(rider)/payment-setup' as never)}
        activeOpacity={0.85}
      >
        <Ionicons name="add-circle-outline" size={16} color={colors.bg} />
        <Text style={s.gateBtnText}>ADD PAYMENT METHOD</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Home-screen gate: replaces the booking cards with the add-card surface until
// the rider has a linked method. Gates ONLY on a confirmed-empty result.
export function PaymentGate({ children }: Props) {
  const { loading, hasMethod } = useHasPaymentMethod();

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  if (hasMethod === false) {
    return (
      <Animated.View entering={FadeIn.duration(400)} style={s.gate}>
        <PaymentGateCard />
      </Animated.View>
    );
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  center: { paddingVertical: 40, alignItems: 'center' },

  gate: { flex: 1 },
  gateCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm,
  },
  gateIcon: {
    width: 64, height: 64, borderRadius: radius.card,
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  gateTitle: {
    fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary,
    letterSpacing: 1, textAlign: 'center',
  },
  gateBody: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary,
    textAlign: 'center', lineHeight: 20,
  },
  gateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.green,
    borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: spacing.xl,
    width: '100%', marginTop: spacing.xs,
  },
  gateBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.bg, letterSpacing: 1.5 },
});
