// Rider home — shows active ride status with pull-up CTA when driver has accepted.

import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface ActiveRide {
  hasActiveRide: boolean;
  rideId?: string;
  status?: string;
  isDriver?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  matched: 'DRIVER ACCEPTED',
  otw: 'DRIVER EN ROUTE',
  here: 'DRIVER ARRIVED',
  active: 'RIDE IN PROGRESS',
  in_progress: 'RIDE IN PROGRESS',
};

export default function RiderHome() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [active, setActive] = useState<ActiveRide | null>(null);
  const [loading, setLoading] = useState(true);

  const checkActive = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<ActiveRide>('/rides/active', t);
      setActive(data);
    } catch {
      setActive({ hasActiveRide: false });
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void checkActive(); }, [checkActive]);

  const rideStatus = active?.status ?? '';
  const needsPullUp = active?.hasActiveRide && !active.isDriver && rideStatus === 'matched';
  const isOngoing = active?.hasActiveRide && !active.isDriver && ['otw', 'here', 'active', 'in_progress'].includes(rideStatus);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>HMU</Text>
        <Text style={s.sub}>ATL</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.green} style={{ marginTop: 60 }} />
      ) : needsPullUp ? (
        <View style={[s.card, shadow.card, { borderColor: colors.greenBorder, backgroundColor: colors.greenDim }]}>
          <View style={s.cardTop}>
            <View style={s.statusDot} />
            <Text style={[s.statusLabel, { color: colors.green }]}>DRIVER ACCEPTED</Text>
          </View>
          <Text style={s.cardTitle}>Enter your trip details</Text>
          <Text style={s.cardBody}>
            Your driver accepted your request. Share your exact pickup location so they can navigate to you.
          </Text>
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => router.push(`/(rider)/ride/pull-up?rideId=${active!.rideId}` as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="location" size={14} color={colors.bg} />
            <Text style={s.ctaLabel}>SHARE MY LOCATION</Text>
          </TouchableOpacity>
        </View>
      ) : isOngoing ? (
        <View style={[s.card, shadow.card]}>
          <View style={s.cardTop}>
            <View style={[s.statusDot, { backgroundColor: colors.blue }]} />
            <Text style={[s.statusLabel, { color: colors.blue }]}>{STATUS_LABEL[rideStatus] ?? rideStatus.toUpperCase()}</Text>
          </View>
          <Text style={s.cardTitle}>Ride in progress</Text>
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => router.push(`/(rider)/ride/${active!.rideId}` as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="car" size={14} color={colors.textPrimary} />
            <Text style={[s.ctaLabel, { color: colors.textPrimary }]}>VIEW RIDE</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.empty}>
          <Ionicons name="car-outline" size={40} color={colors.textFaint} />
          <Text style={s.emptyTitle}>No active ride</Text>
          <Text style={s.emptyBody}>Book a ride from the web app to get started.</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.green },
  sub: { fontFamily: fonts.mono, fontSize: 14, color: colors.textFaint, letterSpacing: 3 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, margin: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  statusLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2 },
  cardTitle: { fontFamily: fonts.mono, fontSize: 16, color: colors.textPrimary, letterSpacing: 0.5, marginBottom: spacing.sm },
  cardBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 22, marginBottom: spacing.lg },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.green,
    borderRadius: radius.pill, paddingVertical: 14,
  },
  ctaLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.bg, letterSpacing: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyTitle: { fontFamily: fonts.mono, fontSize: 14, color: colors.textSecondary, letterSpacing: 1 },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center', lineHeight: 20 },
});
