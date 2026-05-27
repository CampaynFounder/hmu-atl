import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  RefreshControl, ActivityIndicator,
  Animated, Easing, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RideRecord {
  id: string;
  ref_code: string | null;
  status: string;
  amount: number;
  final_agreed_price: number | null;
  driver_payout_amount: number | null;
  platform_fee_amount: number | null;
  driver_rating: number | null;
  rider_rating: number | null;
  driver_name: string | null;
  driver_handle: string | null;
  rider_name: string | null;
  rider_handle: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  destination: string | null;
  is_cash: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  dispute_window_expires_at: string | null;
}

interface ActiveRide {
  hasActiveRide: boolean;
  rideId?: string;
  status?: string;
  isDriver?: boolean;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:     { label: 'PENDING',     color: colors.amber,        bg: colors.amberDim,  border: colors.amberBorder },
  matched:     { label: 'MATCHED',     color: colors.amber,        bg: colors.amberDim,  border: colors.amberBorder },
  accepted:    { label: 'ACCEPTED',    color: colors.amber,        bg: colors.amberDim,  border: colors.amberBorder },
  otw:         { label: 'EN ROUTE',    color: colors.blue,         bg: colors.blueDim,   border: colors.blueBorder  },
  here:        { label: 'ARRIVED',     color: colors.blue,         bg: colors.blueDim,   border: colors.blueBorder  },
  active:      { label: 'IN PROGRESS', color: colors.green,        bg: colors.greenDim,  border: colors.greenBorder },
  in_progress: { label: 'IN PROGRESS', color: colors.green,        bg: colors.greenDim,  border: colors.greenBorder },
  ended:       { label: 'COMPLETED',   color: colors.textTertiary, bg: colors.cardAlt,   border: colors.border      },
  completed:   { label: 'COMPLETED',   color: colors.textTertiary, bg: colors.cardAlt,   border: colors.border      },
  cancelled:   { label: 'CANCELLED',   color: colors.red,          bg: colors.redDim,    border: colors.redBorder   },
};

const ACTIVE_STATUSES = new Set(['pending', 'matched', 'accepted', 'otw', 'here', 'active', 'in_progress']);

function statusMeta(status: string | null | undefined) {
  if (!status) return { label: 'UNKNOWN', color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
  return STATUS[status] ?? { label: status.toUpperCase(), color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
}

function isActiveStatus(status: string) {
  return ACTIVE_STATUSES.has(status);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function shortAddr(addr: string | null): string {
  if (!addr) return '—';
  const parts = addr.split(',');
  return parts[0]?.trim() ?? addr;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DriverRides() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [rides, setRides] = useState<RideRecord[]>([]);
  const [active, setActive] = useState<ActiveRide | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Header entrance animation
  const headerAnim = useRef(new Animated.Value(0)).current;

  const fetchAll = useCallback(async () => {
    try {
      const token = await getToken();
      const [historyData, activeData] = await Promise.allSettled([
        apiClient<{ rides: RideRecord[] }>('/rides/history', token),
        apiClient<ActiveRide>('/rides/active', token),
      ]);
      if (historyData.status === 'fulfilled') setRides(historyData.value.rides ?? []);
      if (activeData.status === 'fulfilled') setActive(activeData.value);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchAll();
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 400,
      easing: Easing.bezier(0.33, 1, 0.68, 1),
      useNativeDriver: true,
    }).start();
  }, [fetchAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchAll();
  }, [fetchAll]);

  function openRide(ride: RideRecord) {
    router.push({
      pathname: '/(driver)/ride/[id]' as any,
      params: { id: ride.id, d: JSON.stringify(ride) },
    });
  }

  function openActiveRide(rideId: string) {
    router.push({
      pathname: '/(driver)/ride/active' as any,
      params: { rideId },
    });
  }

  // Find the active ride record from history list (if loaded)
  const activeRecord = active?.hasActiveRide
    ? rides.find((r) => r.id === active.rideId) ?? null
    : null;

  const completedRides = rides.filter((r) => !isActiveStatus(r.status));

  if (loading) {
    return (
      <View style={[s.loader, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Animated header ── */}
      <Animated.View style={[
        s.header,
        {
          opacity: headerAnim,
          transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}>
        <View>
          <Text style={s.pageTitle}>RIDES</Text>
          <Text style={s.pageSubtitle}>YOUR RIDE HISTORY</Text>
        </View>
        <View style={s.countBadge}>
          <Text style={s.countText}>{rides.length}</Text>
        </View>
      </Animated.View>

      {/* ── List ── */}
      <FlatList
        data={completedRides}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        ListHeaderComponent={
          <>
            {/* Active ride banner */}
            {active?.hasActiveRide && active.rideId && (
              <ActiveRideBanner
                activeRide={active}
                record={activeRecord}
                onPress={() => openActiveRide(active.rideId!)}
              />
            )}

            {completedRides.length > 0 && (
              <Text style={s.sectionLabel}>RECENT RIDES</Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="car-outline" size={40} color={colors.textFaint} />
            <Text style={s.emptyTitle}>NO RIDES YET</Text>
            <Text style={s.emptyBody}>Accept a request to start your first ride</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <AnimatedRideRow ride={item} index={index} onPress={() => openRide(item)} />
        )}
      />
    </View>
  );
}

// ── ActiveRideBanner ──────────────────────────────────────────────────────────

function ActiveRideBanner({
  activeRide,
  record,
  onPress,
}: {
  activeRide: ActiveRide;
  record: RideRecord | null;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 1, duration: 420,
      easing: Easing.bezier(0.33, 1, 0.68, 1),
      useNativeDriver: true,
    }).start();
  }, []);

  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();

  const meta = statusMeta(activeRide.status ?? 'active');
  const gross = Number(record?.final_agreed_price ?? record?.amount ?? 0);

  return (
    <Animated.View style={{
      opacity: slideAnim,
      transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
    }}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
        <Animated.View style={[ab.card, { transform: [{ scale }] }]}>
          {/* Top row */}
          <View style={ab.topRow}>
            <View style={ab.dotWrap}>
              <PulseDot />
              <Text style={ab.activeLabel}>RIDE IN PROGRESS</Text>
            </View>
            <View style={[ab.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
              <Text style={[ab.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>

          {/* Route */}
          {record && (
            <View style={ab.routeRow}>
              <View style={ab.routeCol}>
                <View style={ab.routeDot} />
                <Text style={ab.routeAddr} numberOfLines={1}>{shortAddr(record.pickup_address)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={12} color={colors.textFaint} style={{ marginHorizontal: 6 }} />
              <View style={ab.routeCol}>
                <Ionicons name="location" size={10} color={colors.green} />
                <Text style={ab.routeAddr} numberOfLines={1}>{shortAddr(record.dropoff_address ?? record.destination)}</Text>
              </View>
            </View>
          )}

          {/* Bottom row */}
          <View style={ab.bottomRow}>
            {gross > 0 && (
              <Text style={ab.amount}>${gross.toFixed(2)}</Text>
            )}
            <View style={{ flex: 1 }} />
            <View style={ab.viewBtn}>
              <Text style={ab.viewText}>VIEW RIDE</Text>
              <Ionicons name="arrow-forward" size={11} color={colors.bg} />
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

// ── AnimatedRideRow ───────────────────────────────────────────────────────────

function AnimatedRideRow({
  ride, index, onPress,
}: {
  ride: RideRecord;
  index: number;
  onPress: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = Math.min(index * 55, 500);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration: 340, delay,
        easing: Easing.bezier(0.33, 1, 0.68, 1), useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration: 340, delay,
        easing: Easing.bezier(0.33, 1, 0.68, 1), useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const pressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 3 }).start();

  const meta = statusMeta(ride.status);
  const kept = Number(ride.driver_payout_amount ?? ride.final_agreed_price ?? ride.amount ?? 0);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
        <View style={[r.card, shadow.card]}>
          {/* Top row: date + amount */}
          <View style={r.topRow}>
            <Text style={r.date}>{formatDate(ride.created_at)}</Text>
            <Text style={r.amount}>${kept.toFixed(2)}</Text>
          </View>

          {/* Route */}
          <View style={r.routeRow}>
            <View style={r.routeDotWrap}>
              <View style={r.dotFrom} />
              <View style={r.routeLine} />
              <Ionicons name="location" size={9} color={colors.green} />
            </View>
            <View style={r.addrsCol}>
              <Text style={r.addrFrom} numberOfLines={1}>{shortAddr(ride.pickup_address)}</Text>
              <Text style={r.addrTo} numberOfLines={1}>{shortAddr(ride.dropoff_address ?? ride.destination)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </View>

          {/* Pills row */}
          <View style={r.pillsRow}>
            <View style={[r.pill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
              <Text style={[r.pillText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <View style={[r.pill, ride.is_cash
              ? { backgroundColor: colors.cashDim, borderColor: colors.cashBorder }
              : { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }
            ]}>
              <Text style={[r.pillText, { color: ride.is_cash ? colors.cash : colors.green }]}>
                {ride.is_cash ? 'CASH' : 'DIGITAL'}
              </Text>
            </View>
            {ride.rider_rating != null && (
              <View style={[r.pill, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Ionicons name="star" size={9} color={colors.amber} />
                <Text style={[r.pillText, { color: colors.amber, marginLeft: 3 }]}>
                  {Number(ride.rider_rating).toFixed(1)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── PulseDot ──────────────────────────────────────────────────────────────────

function PulseDot() {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1.9, duration: 750, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 750, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={{ width: 10, height: 10, marginRight: 7 }}>
      <Animated.View style={[ab.dot, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
      <View style={[ab.dot, { position: 'absolute' }]} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  pageTitle: { fontFamily: fonts.display, fontSize: 36, color: colors.textPrimary, lineHeight: 38 },
  pageSubtitle: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2, marginTop: 2 },
  countBadge: { backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  countText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },

  listContent: { paddingHorizontal: spacing.xl, paddingBottom: 48 },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.md, marginTop: spacing.sm },

  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.md },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.textFaint, letterSpacing: 1 },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
});

// Active banner styles
const ab = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.greenBorder, ...shadow.card },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  dotWrap: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.green },
  activeLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 1.5 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  routeCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  routeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textFaint },
  routeAddr: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  bottomRow: { flexDirection: 'row', alignItems: 'center' },
  amount: { fontFamily: fonts.display, fontSize: 28, color: colors.green },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 9 },
  viewText: { fontFamily: fonts.mono, fontSize: 10, color: colors.bg, letterSpacing: 1 },
});

// Row styles
const r = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.cardInner, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  date: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 0.5 },
  amount: { fontFamily: fonts.display, fontSize: 22, color: colors.green },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  routeDotWrap: { width: 14, alignItems: 'center', gap: 2, marginRight: spacing.sm },
  dotFrom: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textFaint },
  routeLine: { width: 1, height: 10, backgroundColor: colors.border },
  addrsCol: { flex: 1, gap: 6 },
  addrFrom: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  addrTo: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  pillsRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  pillText: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5 },
});
