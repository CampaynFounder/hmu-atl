// My Requests — persistent surface for the rider to return to an in-flight
// request (status, responses, cancel) after leaving the create flow.
//
// Phase 1: blasts via GET /api/blast/active. Routes back into the existing
// interaction screens (book/blast-board for blast). Structured to append
// direct / down-bad / pickup actives as those endpoints are wired in.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface ActiveBlast {
  id: string;
  shortcode: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  price: number;
  expiresAt: string;
}

interface ActiveDirect {
  id: string;
  handle: string;
  price: number;
  expiresAt: string;
  pickupAddress: string;
  dropoffAddress: string;
}

interface ActiveDownBad {
  id: string;
  price: number;
  expiresAt: string;
  pickupAddress: string;
  dropoffAddress: string;
}

interface ActiveDelivery {
  id: string;
  status: string;
  merchantName: string;
  customerAddress: string;
}

// A normalized request row the list renders, regardless of source type.
interface RequestItem {
  key: string;
  type: 'blast' | 'direct' | 'down-bad' | 'pickup';
  typeLabel: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  pickup: string;
  dropoff: string;
  price: number | null;
  expiresAt: string | null;
  cta: string;
  onPress: () => void;
}

function useCountdown(expiresAt: string | null) {
  const [secsLeft, setSecsLeft] = useState(() =>
    expiresAt ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)) : 0,
  );
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setSecsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  return { secsLeft, display: `${mins}:${String(secs).padStart(2, '0')}` };
}

export default function MyRequests() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await getToken();
      const [blastR, directR, downBadR, deliveryR] = await Promise.allSettled([
        apiClient<{ blast: ActiveBlast | null }>('/blast/active', t),
        apiClient<{ post: ActiveDirect | null }>('/rider/direct/active', t),
        apiClient<{ post: ActiveDownBad | null }>('/rider/down-bad/active', t),
        apiClient<{ delivery: ActiveDelivery | null }>('/delivery/active', t),
      ]);

      const next: RequestItem[] = [];

      const blast = blastR.status === 'fulfilled' ? blastR.value.blast : null;
      if (blast) {
        next.push({
          key: `blast:${blast.id}`, type: 'blast', typeLabel: 'BLAST', icon: 'radio-outline',
          pickup: blast.pickupAddress, dropoff: blast.dropoffAddress,
          price: blast.price, expiresAt: blast.expiresAt, cta: 'SEE OFFERS',
          onPress: () => router.push({
            pathname: '/(rider)/book/blast-board',
            params: { blastId: blast.id, shortcode: blast.shortcode ?? '', expiresAt: blast.expiresAt, price: String(blast.price) },
          } as never),
        });
      }

      const direct = directR.status === 'fulfilled' ? directR.value.post : null;
      if (direct) {
        next.push({
          key: `direct:${direct.id}`, type: 'direct', typeLabel: 'DIRECT', icon: 'person-circle-outline',
          pickup: direct.pickupAddress, dropoff: direct.dropoffAddress,
          price: direct.price, expiresAt: direct.expiresAt, cta: 'VIEW',
          onPress: () => router.push({
            pathname: '/(rider)/book/waiting',
            params: { type: 'direct', postId: direct.id, expiresAt: direct.expiresAt, handle: direct.handle, price: String(direct.price) },
          } as never),
        });
      }

      const downBad = downBadR.status === 'fulfilled' ? downBadR.value.post : null;
      if (downBad) {
        next.push({
          key: `down-bad:${downBad.id}`, type: 'down-bad', typeLabel: 'DOWN BAD', icon: 'flame-outline',
          pickup: downBad.pickupAddress, dropoff: downBad.dropoffAddress,
          price: downBad.price, expiresAt: downBad.expiresAt, cta: 'VIEW',
          onPress: () => router.push({
            pathname: '/(rider)/book/waiting',
            params: { type: 'down-bad', postId: downBad.id, expiresAt: downBad.expiresAt, price: String(downBad.price) },
          } as never),
        });
      }

      const delivery = deliveryR.status === 'fulfilled' ? deliveryR.value.delivery : null;
      if (delivery) {
        next.push({
          key: `delivery:${delivery.id}`, type: 'pickup', typeLabel: 'PICKUP', icon: 'bag-handle-outline',
          pickup: delivery.merchantName || 'Pickup', dropoff: delivery.customerAddress,
          price: null, expiresAt: null, cta: 'TRACK',
          onPress: () => router.push(`/(rider)/delivery/${delivery.id}` as never),
        });
      }

      setItems(next);
    } catch {
      // keep prior state on transient errors
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken, router]);

  // Refresh every time the screen gains focus (returning from a request).
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); void load(); }, [load]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.nav}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>MY REQUESTS</Text>
        <View style={s.navSpacer} />
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      ) : items.length === 0 ? (
        <Animated.View entering={FadeIn.duration(350)} style={s.empty}>
          <View style={s.emptyIcon}>
            <Ionicons name="paper-plane-outline" size={30} color={colors.textFaint} />
          </View>
          <Text style={s.emptyTitle}>No active requests</Text>
          <Text style={s.emptyBody}>
            When you blast, book a driver, or post a Down Bad, it shows up here so you can track
            responses and manage it.
          </Text>
          <TouchableOpacity style={s.emptyCta} onPress={() => router.replace('/(rider)/home')} activeOpacity={0.85}>
            <Text style={s.emptyCtaText}>MAKE A REQUEST</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />
          }
        >
          {items.map((item, i) => (
            <RequestCard key={item.key} item={item} index={i} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function RequestCard({ item, index }: { item: RequestItem; index: number }) {
  const countdown = useCountdown(item.expiresAt);
  const expired = countdown != null && countdown.secsLeft === 0;

  return (
    <Animated.View entering={FadeInUp.delay(index * 70).duration(380)}>
      <TouchableOpacity
        style={[s.card, shadow.card, { borderColor: colors.greenBorder }]}
        onPress={item.onPress}
        activeOpacity={0.85}
      >
        <View style={s.cardTop}>
          <View style={s.badge}>
            <Ionicons name={item.icon} size={13} color={colors.green} />
            <Text style={s.badgeText}>{item.typeLabel}</Text>
          </View>
          {countdown && (
            <Text style={[s.countdown, expired && { color: colors.textFaint }]}>
              {expired ? 'EXPIRED' : `${countdown.display} left`}
            </Text>
          )}
        </View>

        <View style={s.route}>
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: colors.green }]} />
            <Text style={s.routeText} numberOfLines={1}>{item.pickup || 'Pickup'}</Text>
          </View>
          <View style={s.routeLine} />
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: colors.amber }]} />
            <Text style={s.routeText} numberOfLines={1}>{item.dropoff || 'Destination'}</Text>
          </View>
        </View>

        <View style={s.cardBottom}>
          {item.price != null && <Text style={s.price}>${item.price.toFixed(2)}</Text>}
          <View style={s.manage}>
            <Text style={s.manageText}>{item.cta}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.green} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  nav: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  navTitle: {
    flex: 1, textAlign: 'center', fontFamily: fonts.mono,
    fontSize: 13, color: colors.textPrimary, letterSpacing: 1.5,
  },
  navSpacer: { width: 30 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: 48 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 21 },
  emptyCta: {
    marginTop: spacing.sm, backgroundColor: colors.green,
    borderRadius: radius.pill, paddingVertical: 13, paddingHorizontal: 28,
  },
  emptyCtaText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.lg, borderWidth: 1, gap: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.greenDim, borderRadius: radius.pill,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  badgeText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.green, letterSpacing: 1.2 },
  countdown: { fontFamily: fonts.mono, fontSize: 12, color: colors.amber, letterSpacing: 0.5 },

  route: { gap: 2 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  routeLine: { width: 1, height: 14, backgroundColor: colors.border, marginLeft: 3.5 },
  routeText: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, flex: 1 },

  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontFamily: fonts.display, fontSize: 20, color: colors.textPrimary },
  manage: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  manageText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.green, letterSpacing: 1 },
});
