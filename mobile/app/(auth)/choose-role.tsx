import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

export default function ChooseRole() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const [selecting, setSelecting] = useState<'rider' | 'driver' | null>(null);
  const [checking, setChecking] = useState(true);

  // Safety net: existing drivers who accidentally hit sign-up bypass this screen
  useEffect(() => {
    async function init() {
      try {
        const t = await getToken();
        const me = await apiClient<{ profileType: string }>('/users/me', t);
        if (me.profileType === 'driver') {
          router.replace('/');
          return;
        }
      } catch {}
      setChecking(false);
    }
    void init();
  }, []);

  const selectRider = useCallback(async () => {
    setSelecting('rider');
    try {
      const t = await getToken();
      await apiClient('/users/me', t, {
        method: 'PATCH',
        body: JSON.stringify({ profileType: 'rider' }),
      });
      router.replace('/(rider)/onboarding' as any);
    } catch {
      router.replace('/');
    }
  }, [getToken, router]);

  const selectDriver = useCallback(async () => {
    setSelecting('driver');
    try {
      const t = await getToken();
      await apiClient('/users/me', t, {
        method: 'PATCH',
        body: JSON.stringify({ profileType: 'driver' }),
      });
      router.replace('/(driver)/onboarding' as any);
    } catch {
      router.replace('/');
    }
  }, [getToken, router]);

  if (checking) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <Animated.View entering={FadeIn.delay(100).duration(600)} style={s.header}>
        <Text style={s.logo}>HMU</Text>
        <Text style={s.logoSub}>ATL</Text>
      </Animated.View>

      <Animated.Text entering={FadeInDown.delay(300).duration(500)} style={s.heading}>
        HOW ARE YOU{'\n'}USING HMU?
      </Animated.Text>

      <View style={s.cards}>
        <Animated.View entering={FadeInUp.delay(450).duration(450)}>
          <TouchableOpacity
            style={[s.card, s.riderCard, shadow.glow]}
            onPress={selectRider}
            activeOpacity={0.85}
            disabled={selecting !== null}
          >
            <View style={[s.iconWrap, { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }]}>
              <Ionicons name="person" size={28} color={colors.green} />
            </View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>I NEED A RIDE</Text>
              <Text style={s.cardDesc}>Book drivers, track your trip, pay in-app</Text>
            </View>
            {selecting === 'rider'
              ? <ActivityIndicator color={colors.green} size="small" />
              : <Ionicons name="chevron-forward" size={20} color={colors.green} />
            }
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(580).duration(450)}>
          <TouchableOpacity
            style={[s.card, s.driverCard]}
            onPress={selectDriver}
            activeOpacity={0.85}
            disabled={selecting !== null}
          >
            <View style={[s.iconWrap, { backgroundColor: colors.amberDim, borderColor: colors.amberBorder }]}>
              {selecting === 'driver'
                ? <ActivityIndicator color={colors.amber} size="small" />
                : <Ionicons name="car" size={28} color={colors.amber} />}
            </View>
            <View style={s.cardText}>
              <Text style={[s.cardTitle, { color: colors.amber }]}>I DRIVE</Text>
              <Text style={s.cardDesc}>Earn on your schedule. Set your own price.</Text>
            </View>
            {selecting !== 'driver' && <Ionicons name="chevron-forward" size={20} color={colors.amber} />}
          </TouchableOpacity>
        </Animated.View>
      </View>

      <Animated.View entering={FadeIn.delay(700).duration(400)} style={s.footer}>
        <Text style={s.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={s.footerLink}>Sign in →</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  logo: { fontFamily: fonts.display, fontSize: 48, color: colors.green, letterSpacing: 3 },
  logoSub: { fontFamily: fonts.mono, fontSize: 16, color: colors.textFaint, letterSpacing: 4 },

  heading: {
    fontFamily: fonts.display, fontSize: 44, color: colors.textPrimary,
    letterSpacing: 1, lineHeight: 48,
  },

  cards: { gap: spacing.md },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, flexDirection: 'row', alignItems: 'center',
    gap: spacing.md, borderWidth: 1,
  },
  riderCard: { borderColor: colors.greenBorder },
  driverCard: { borderColor: colors.amberBorder },

  iconWrap: {
    width: 52, height: 52, borderRadius: radius.cardInner,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },

  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: fonts.monoBold, fontSize: 13, color: colors.green,
    letterSpacing: 1, marginBottom: 4,
  },
  cardDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 18 },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
  footerLink: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.green },
});
