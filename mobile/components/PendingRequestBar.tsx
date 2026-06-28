// Persistent "you have a ride request" bar for drivers. Shows on any driver tab
// screen whenever there is at least one pending incoming request, so a driver
// who isn't on the feed still knows a request came in — even one that arrived
// while the app was backgrounded (a transient toast can be missed, and the
// realtime event is lost while suspended). The count is SERVER-authoritative
// (GET /drivers/requests), refreshed on mount, on app-foreground, on route
// change, and whenever a realtime request event bumps the unread counter.

import { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { useStableToken } from '@/hooks/use-stable-token';
import { apiClient } from '@/lib/api';
import { useNotifications } from '@/contexts/notifications';

// Driver tab routes where the bar floats above the tab bar. We hide it on the
// feed itself (the cards are right there) and on full-screen flows.
const DRIVER_TAB_ROUTES = ['/home', '/rides', '/profile'];
// Mirror of the driver tab bar band height (app/(driver)/_layout.tsx).
const TAB_BASE_HEIGHT = 64;

export function PendingRequestBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const getToken = useStableToken();
  const { user } = useUser();
  const { unreadRequestCount, activeRide } = useNotifications();
  const [serverCount, setServerCount] = useState(0);

  const isDriver = (user?.publicMetadata?.profileType as string) === 'driver';

  const refresh = useCallback(async () => {
    if (!isDriver) { setServerCount(0); return; }
    try {
      const t = await getToken();
      const data = await apiClient<{ requests?: unknown[] }>('/drivers/requests', t);
      setServerCount(Array.isArray(data.requests) ? data.requests.length : 0);
    } catch { /* best-effort — keep prior count on transient errors */ }
  }, [isDriver, getToken]);

  // Refresh on mount + whenever the route changes (covers returning to a tab),
  // whenever a realtime request bumps the unread counter, and on app-foreground
  // (covers a request that landed while the app was suspended).
  useEffect(() => { void refresh(); }, [refresh, pathname, unreadRequestCount]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);

  // Realtime unread can lead the server fetch by a beat — show the bar on either.
  const count = Math.max(serverCount, isDriver ? unreadRequestCount : 0);

  if (!isDriver || count <= 0) return null;
  if (activeRide) return null;                 // busy on a ride — don't nag
  if (pathname === '/feed') return null;       // already looking at the cards
  if (!DRIVER_TAB_ROUTES.includes(pathname)) return null;

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
        onPress={() => router.push('/(driver)/feed' as never)}
      >
        <View style={s.pulseDot} />
        <View style={s.iconWrap}>
          <Ionicons name="car-sport" size={16} color={colors.bg} />
        </View>
        <View style={s.textWrap}>
          <Text style={s.label}>{count > 1 ? `${count} RIDE REQUESTS` : 'NEW RIDE REQUEST'}</Text>
          <Text style={s.action} numberOfLines={1}>Tap to respond before it expires</Text>
        </View>
        <View style={s.cta}>
          <Text style={s.ctaText}>VIEW</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.amber} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.pill,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.amberBorder,
  },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  iconWrap: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.amber,
    alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  label: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.amber, letterSpacing: 1.2 },
  action: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, marginTop: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.amber, letterSpacing: 1 },
});
