import { useCallback, useRef, useState, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useStableToken } from '@/hooks/use-stable-token';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface PaymentMethod {
  id: string;
  brand: string | null;
  last4: string | null;
  isDefault: boolean;
}

interface Props {
  children: ReactNode;
}

export function PaymentGate({ children }: Props) {
  const getToken = useStableToken();
  const router = useRouter();
  // null = not yet known (never had a successful check). We ONLY gate on a
  // confirmed-empty array — never on null — so a failed/slow check can't falsely
  // show "link a payment method" to a rider who already has a card.
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);

  const check = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<{ methods: PaymentMethod[] }>('/rider/payment-methods', t);
      setMethods(data.methods ?? []);
    } catch {
      // Do NOT assume "no methods" on error — that wrongly gates a paying rider.
      // Keep the last known result (or null = unknown → fall through to booking;
      // COO still enforces a linked card server-side).
    } finally {
      setLoading(false);
      hasLoaded.current = true;
    }
  }, [getToken]);

  // First focus: show spinner. Subsequent focuses: silent refresh (e.g. returning from payment-setup).
  useFocusEffect(useCallback(() => {
    if (!hasLoaded.current) setLoading(true);
    void check();
  }, [check]));

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  // Only show the gate when we POSITIVELY confirmed the rider has no card.
  // null (check never succeeded) falls through to the booking cards.
  if (methods !== null && methods.length === 0) {
    return (
      <Animated.View entering={FadeIn.duration(400)} style={s.gate}>
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[s.gateCard, shadow.card]}>
          <View style={s.gateIcon}>
            <Ionicons name="card-outline" size={32} color={colors.textFaint} />
          </View>
          <Text style={s.gateTitle}>LINK A PAYMENT METHOD</Text>
          <Text style={s.gateBody}>
            Add a card before you can book. HMU holds payment when your driver accepts — you're never charged until pickup.
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
