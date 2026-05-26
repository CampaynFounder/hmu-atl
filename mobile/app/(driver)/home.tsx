import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Platform, ActivityIndicator,
  Animated, Easing, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'D' | 'W' | 'M';

interface EarningsBucket {
  gross: number; fees: number; kept: number; rides: number;
  capHit: boolean; capUsed: number; capMax: number;
}

// Shape returned by GET /api/driver/earnings
interface EarningsResponse {
  today: EarningsBucket;
  week: EarningsBucket;
  tier: string;
}

// Shape from GET /api/driver/analytics timeseries
interface TimeseriesPoint {
  day: string;       // "2026-05-26"
  cash: number;
  nonCash: number;
  rides: number;
}

interface AnalyticsResponse {
  timeseries: TimeseriesPoint[];
}

interface BarPoint { label: string; value: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function haptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  Haptics.impactAsync(style).catch(() => {});
}

async function registerPushToken(clerkToken: string) {
  const expoPush = await Notifications.getExpoPushTokenAsync().catch(() => null);
  if (!expoPush) return;
  await apiClient('/users/push-token', clerkToken, {
    method: 'POST',
    body: JSON.stringify({
      push_token: expoPush.data,
      push_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  }).catch(() => {});
}

function buildBars(timeseries: TimeseriesPoint[], period: Period): BarPoint[] {
  if (!timeseries?.length) return [];

  if (period === 'D') {
    // Last 7 days — one bar per day
    return timeseries.slice(-7).map((p) => ({
      label: new Date(p.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      value: Math.round((p.cash + p.nonCash) * 100) / 100,
    }));
  }

  if (period === 'W') {
    // Last 4 weeks — group by week
    const weeks: Record<string, number> = {};
    timeseries.slice(-28).forEach((p) => {
      const d = new Date(p.day + 'T12:00:00');
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeks[key] = (weeks[key] ?? 0) + p.cash + p.nonCash;
    });
    return Object.entries(weeks).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
  }

  // Month — last 6 months grouped
  const months: Record<string, number> = {};
  timeseries.forEach((p) => {
    const key = new Date(p.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' });
    months[key] = (months[key] ?? 0) + p.cash + p.nonCash;
  });
  return Object.entries(months).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
}

// ── Animated counter hook ─────────────────────────────────────────────────────

function useAnimatedAmount(target: number): string {
  const animVal = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState('0.00');

  useEffect(() => {
    const startFrom = target === 0 ? 20 : 0;
    animVal.setValue(startFrom);

    const id = animVal.addListener(({ value }) => {
      setDisplay(value.toFixed(2));
    });

    Animated.timing(animVal, {
      toValue: target,
      duration: target === 0 ? 900 : 1100,
      // Zero: accelerate downward (slot spinning down). Non-zero: decelerate upward (satisfying count-up).
      easing: target === 0 ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      animVal.removeListener(id);
      setDisplay(target.toFixed(2));
    });

    return () => animVal.removeListener(id);
  }, [target]);

  return display;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DriverHome() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [earnings, setEarnings] = useState<EarningsResponse | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('D');
  const tokenRegistered = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      const token = await getToken();
      const [earningsData, analyticsData] = await Promise.allSettled([
        apiClient<EarningsResponse>('/driver/earnings', token),
        apiClient<AnalyticsResponse>('/driver/analytics', token),
      ]);
      if (earningsData.status === 'fulfilled') setEarnings(earningsData.value);
      if (analyticsData.status === 'fulfilled') setTimeseries(analyticsData.value.timeseries ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchAll();
    if (!tokenRegistered.current) {
      tokenRegistered.current = true;
      getToken().then((t) => { if (t) void registerPushToken(t); }).catch(() => {});
    }
  }, [fetchAll, getToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchAll();
  }, [fetchAll]);

  function selectPeriod(p: Period) {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setPeriod(p);
  }

  const handle = (user?.unsafeMetadata?.handle as string) ?? user?.fullName ?? 'Driver';
  const isFirst = (user?.publicMetadata?.tier as string) === 'hmu_first';

  const bucket: EarningsBucket =
    period === 'D' ? (earnings?.today ?? zeroBucket(isFirst ? 25 : 40))
    : period === 'W' ? (earnings?.week ?? zeroBucket(isFirst ? 100 : 150))
    : earnings?.week ?? zeroBucket(isFirst ? 800 : 400); // month: fallback to week until endpoint exists

  const bars = buildBars(timeseries, period);

  if (loading) {
    return (
      <View style={[s.loader, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{handle.toUpperCase()}</Text>
          <TierBadge isFirst={isFirst} />
        </View>
        <DepthButton onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); router.push('/(driver)/feed'); }} style={s.requestsBtn}>
          <Text style={s.requestsBtnText}>REQUESTS</Text>
          <Ionicons name="layers-outline" size={13} color={colors.bg} style={{ marginLeft: 4 }} />
        </DepthButton>
      </View>

      {/* Period toggle */}
      <PeriodToggle value={period} onChange={selectPeriod} />

      {/* Earnings summary card */}
      <View style={[s.card, shadow.card]}>
        <Text style={s.cardLabel}>
          {period === 'D' ? 'TODAY' : period === 'W' ? 'THIS WEEK' : 'THIS MONTH'}
        </Text>

        <AnimatedAmount value={bucket.kept} />
        <Text style={s.subLabel}>kept after fees</Text>

        <View style={s.pillRow}>
          <Pill label="RIDES" value={String(bucket.rides)} />
          <Pill label="GROSS" value={`$${bucket.gross.toFixed(2)}`} />
          <Pill label="FEES" value={`$${bucket.fees.toFixed(2)}`} />
        </View>

        {bucket.capHit ? (
          <View style={s.capBanner}>
            <Text style={s.capBannerText}>🎉 Cap hit — fee-free for the rest of the period</Text>
          </View>
        ) : (
          <CapBar used={bucket.capUsed} max={bucket.capMax} />
        )}
      </View>

      {/* Earnings over time */}
      <View style={[s.card, shadow.card]}>
        <Text style={s.cardLabel}>EARNINGS OVER TIME</Text>
        {bars.length > 0
          ? <BarChart bars={bars} />
          : <View style={s.chartEmpty}><Text style={s.chartEmptyText}>Complete a ride to see your chart</Text></View>
        }
      </View>

      {/* HMU First upsell */}
      {!isFirst && (
        <DepthButton
          onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); router.push('/(driver)/payout-setup'); }}
          style={s.upsell}
        >
          <View style={s.upsellRow}>
            <Text style={s.upsellTitle}>GO HMU FIRST</Text>
            <Text style={s.upsellPrice}>$9.99/mo</Text>
          </View>
          <Text style={s.upsellBody}>Lower fee cap, instant payouts, priority support.</Text>
          <View style={s.upsellCta}>
            <Text style={s.upsellCtaText}>UPGRADE</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.green} />
          </View>
        </DepthButton>
      )}
    </ScrollView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AnimatedAmount({ value }: { value: number }) {
  const display = useAnimatedAmount(value);
  return (
    <View style={s.amountRow}>
      <Text style={s.dollarSign}>$</Text>
      <Text style={s.bigAmount}>{display}</Text>
    </View>
  );
}

function TierBadge({ isFirst }: { isFirst: boolean }) {
  return (
    <View style={[s.tierBadge, isFirst ? s.tierFirst : s.tierFree]}>
      <Text style={[s.tierText, isFirst && { color: colors.bg }]}>
        {isFirst ? 'HMU FIRST' : 'FREE TIER'}
      </Text>
    </View>
  );
}

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <View style={s.toggle}>
      {(['D', 'W', 'M'] as Period[]).map((p) => (
        <TouchableOpacity
          key={p}
          style={[s.toggleBtn, value === p && s.toggleActive]}
          onPress={() => onChange(p)}
          activeOpacity={0.8}
        >
          <Text style={[s.toggleText, value === p && s.toggleTextActive]}>
            {p === 'D' ? 'DAY' : p === 'W' ? 'WEEK' : 'MONTH'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillValue}>{value}</Text>
      <Text style={s.pillLabel}>{label}</Text>
    </View>
  );
}

function CapBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(1, used / Math.max(max, 1));
  const barColor = pct > 0.8 ? colors.red : pct > 0.5 ? colors.amber : colors.green;
  return (
    <View style={s.capWrap}>
      <View style={s.capTrack}>
        <View style={[s.capFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={s.capText}>${used.toFixed(2)} / ${max} fee cap</Text>
    </View>
  );
}

function BarChart({ bars }: { bars: BarPoint[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <View style={s.chart}>
      {bars.map((bar, i) => {
        const heightPct = Math.max((bar.value / max) * 100, bar.value > 0 ? 5 : 0);
        return (
          <View key={i} style={s.barCol}>
            {bar.value > 0 && (
              <Text style={s.barAmt}>${bar.value >= 100 ? `${Math.round(bar.value)}` : bar.value.toFixed(0)}</Text>
            )}
            <View style={s.barTrack}>
              <View style={[s.barFill, { height: `${heightPct}%` as any }]} />
            </View>
            <Text style={s.barLabel}>{bar.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Pressable with spring scale-down depth + optional haptic */
function DepthButton({ onPress, style, children }: { onPress: () => void; style?: object; children: React.ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

function zeroBucket(capMax: number): EarningsBucket {
  return { gross: 0, fees: 0, kept: 0, rides: 0, capHit: false, capUsed: 0, capMax };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 48 },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  greeting: { fontFamily: fonts.display, fontSize: 36, color: colors.textPrimary, lineHeight: 38 },
  tierBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: spacing.xs },
  tierFree: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  tierFirst: { backgroundColor: colors.green },
  tierText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },
  requestsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  requestsBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.bg, letterSpacing: 1 },

  toggle: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  toggleActive: { backgroundColor: colors.green, shadowColor: colors.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  toggleText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1 },
  toggleTextActive: { color: colors.bg },

  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.sm },

  amountRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 },
  dollarSign: { fontFamily: fonts.display, fontSize: 28, color: colors.green, lineHeight: 54, marginRight: 2 },
  bigAmount: { fontFamily: fonts.display, fontSize: 52, color: colors.green, lineHeight: 54 },
  subLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, marginBottom: spacing.lg },

  pillRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  pill: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.cardInner, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  pillValue: { fontFamily: fonts.display, fontSize: 18, color: colors.textPrimary, marginBottom: 2 },
  pillLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },

  capBanner: { backgroundColor: colors.greenDim, borderRadius: radius.tag, padding: spacing.md, borderWidth: 1, borderColor: colors.greenBorder },
  capBannerText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.green, textAlign: 'center' },
  capWrap: { gap: spacing.xs },
  capTrack: { height: 4, backgroundColor: colors.cardAlt, borderRadius: 2, overflow: 'hidden' },
  capFill: { height: '100%', borderRadius: 2 },
  capText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 5, marginTop: spacing.xs },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
  barAmt: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, textAlign: 'center' },
  barTrack: { width: '100%', flex: 1, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden', backgroundColor: colors.cardAlt },
  barFill: { width: '100%', backgroundColor: colors.green, borderRadius: 4 },
  barLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, textAlign: 'center' },
  chartEmpty: { height: 80, alignItems: 'center', justifyContent: 'center' },
  chartEmptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center' },

  upsell: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, borderWidth: 1, borderColor: colors.amberBorder },
  upsellRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  upsellTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.amber },
  upsellPrice: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber },
  upsellBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 20, marginBottom: spacing.lg },
  upsellCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upsellCtaText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, letterSpacing: 1 },
});
