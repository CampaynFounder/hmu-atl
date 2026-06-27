// Persistent "return to your ride" bar. Shows on the main rider tab screens
// whenever the user has an in-flight ride, so they can jump back into it from
// anywhere (the ride history tab has no link to the live ride) and always see
// the next action they need to take. Hidden on the ride screens themselves and
// in flows where it would be redundant.

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { useNotifications } from '@/contexts/notifications';

// Routes where the tab bar is visible — the bar floats just above it. On any
// other screen (the live ride, pull-up, booking flows) we hide it.
const TAB_ROUTES = ['/home', '/browse', '/rides', '/requests', '/profile'];
// Mirror of the rider tab bar band height (app/(rider)/_layout.tsx TAB_BASE_HEIGHT).
const TAB_BASE_HEIGHT = 64;

export function ActiveRideBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { activeRide, nextAction } = useNotifications();

  if (!activeRide || !nextAction) return null;
  if (!TAB_ROUTES.includes(pathname)) return null;

  // Seed the rider active screen (status + route) so it renders instantly.
  const target = activeRide.isDriver
    ? nextAction.route
    : nextAction.route
      + `&seedStatus=${activeRide.status}`
      + `&seedPickup=${encodeURIComponent(activeRide.pickupAddress ?? '')}`
      + `&seedDropoff=${encodeURIComponent(activeRide.dropoffAddress ?? '')}`;

  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      exiting={FadeOutDown.duration(200)}
      style={[s.wrap, { bottom: TAB_BASE_HEIGHT + insets.bottom + 8 }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[s.bar, shadow.card]}
        activeOpacity={0.85}
        onPress={() => router.push(target as never)}
      >
        <View style={s.pulseDot} />
        <View style={s.iconWrap}>
          <Ionicons name="car-sport" size={16} color={colors.bg} />
        </View>
        <View style={s.textWrap}>
          <Text style={s.label}>YOUR RIDE IS LIVE</Text>
          <Text style={s.action} numberOfLines={1}>{nextAction.label}</Text>
        </View>
        <View style={s.cta}>
          <Text style={s.ctaText}>OPEN</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.green} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', left: spacing.md, right: spacing.md,
  },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.pill,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  pulseDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green,
  },
  iconWrap: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.green,
    alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  label: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.green, letterSpacing: 1.2 },
  action: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, marginTop: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.green, letterSpacing: 1 },
});
