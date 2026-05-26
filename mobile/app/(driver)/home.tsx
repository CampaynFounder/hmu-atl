import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Platform, ActivityIndicator, Animated, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

type Period = 'D' | 'W' | 'M';

interface EarningsBucket {
  gross: number; fees: number; kept: number; rides: number;
  capHit: boolean; capUsed: number; capMax: number;
}

interface Earnings {
  today: EarningsBucket;
  week: EarningsBucket;
  month?: EarningsBucket;
  tier: string;
}

interface BarPoint { label: string; kept: number; }

async function registerPushToken(token: string) {
  const expoPush = await Notifications.getExpoPushTokenAsync().catch(() => null);
  if (!expoPush) return;
  await apiClient('/users/push-token', token, {
    method: 'POST',
    body: JSON.stringify({
      push_token: expoPush.data,
      push_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  }).catch(() => {});
}

function hapticLight() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
function hapticMedium() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export default function DriverHome() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [bars, setBars] = useState<BarPoint[] | null>(null);
  const [barsLoading, setBarsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('D');
  const tokenRegistered = useRef(false);

  const fetchEarnings = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await apiClient<Earnings>('/driver/earnings', token);
      setEarnings(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [getToken]);

  const fetchBars = useCallback(async (p: Period) => {
    setBarsLoading(true);
    try {
      const token = await getToken();
      const periodMap = { D: 'day', W: 'week', M: 'month' } as const;
      const data = await apiClient<{ bars: BarPoint[] }>(
        `/driver/earnings/history?period=${periodMap[p]}`,
        token,
      );
      setBars(data.bars ?? []);
    } catch {
      setBars([]); // endpoint not yet live — show empty state gracefully
    } finally {
      setBarsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void fetchEarnings();
    void fetchBars(period);
    if (!tokenRegistered.current) {
      tokenRegistered.current = true;
      getToken().then((t) => { if (t) void registerPushToken(t); }).catch(() => {});
    }
  }, [fetchEarnings, fetchBars, getToken, period]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchEarnings();
    void fetchBars(period);
  }, [fetchEarnings, fetchBars, period]);

  function selectPeriod(p: Period) {
    hapticLight();
    setPeriod(p);
    void fetchBars(p);
  }

  const handle = (user?.unsafeMetadata?.handle as string) ?? user?.fullName ?? 'Driver';
  const isFirst = (user?.publicMetadata?.tier as string) === 'hmu_first';

  const bucket: EarningsBucket | null = earnings
    ? (period === 'D' ? earnings.today : period === 'W' ? earnings.week : earnings.month ?? earnings.week)
    : null;

  const capMax = period === 'D' ? (bucket?.capMax ?? 40) : period === 'W' ? (bucket?.capMax ?? 200) : (bucket?.capMax ?? 800);
  const capLabel = period === 'D' ? 'daily fee cap' : period === 'W' ? 'weekly fee cap' : 'monthly fee cap';

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
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.greeting}>{handle.toUpperCase()}</Text>
          <View style={[s.tierBadge, isFirst ? s.tierFirst : s.tierFree]}>
            <Text style={[s.tierText, isFirst && { color: colors.bg }]}>
              {isFirst ? 'HMU FIRST' : 'FREE TIER'}
            </Text>
          </View>
        </View>
        <DepthButton onPress={() => { hapticMedium(); router.push('/(driver)/feed'); }} style={s.requestsBtn}>
          <Text style={s.requestsBtnText}>REQUESTS</Text>
          <Ionicons name="layers-outline" size={13} color={colors.bg} style={{ marginLeft: 4 }} />
        </DepthButton>
      </View>

      {/* Period toggle — shared between both cards */}
      <PeriodToggle value={period} onChange={selectPeriod} />

      {/* Earnings summary card */}
      <View style={[s.card, shadow.card]}>
        <Text style={s.cardLabel}>
          {period === 'D' ? 'TODAY' : period === 'W' ? 'THIS WEEK' : 'THIS MONTH'}
        </Text>
        <Text style={s.bigAmount}>${bucket?.kept.toFixed(2) ?? '0.00'}</Text>
        <Text style={s.subLabel}>kept after fees</Text>

        <View style={s.pillRow}>
          <Pill label="RIDES" value={String(bucket?.rides ?? 0)} />
          <Pill label="GROSS" value={`$${bucket?.gross.toFixed(2) ?? '0.00'}`} />
          <Pill label="FEES" value={`$${bucket?.fees.toFixed(2) ?? '0.00'}`} />
        </View>

        {bucket?.capHit ? (
          <View style={s.capBanner}>
            <Text style={s.capBannerText}>🎉 Cap hit — fee-free for the rest of the period</Text>
          </View>
        ) : (
          <CapBar used={bucket?.capUsed ?? 0} max={capMax} label={capLabel} />
        )}
      </View>

      {/* Earnings over time — bar chart */}
      <View style={[s.card, shadow.card]}>
        <View style={s.chartHeader}>
          <Text style={s.cardLabel}>EARNINGS OVER TIME</Text>
          {barsLoading && <ActivityIndicator size="small" color={colors.green} style={{ marginLeft: 8 }} />}
        </View>

        {barsLoading ? (
          <BarSkeleton />
        ) : bars && bars.length > 0 ? (
          <BarChart bars={bars} />
        ) : (
          <View style={s.chartEmpty}>
            <Text style={s.chartEmptyText}>No history yet — check back after your first ride</Text>
          </View>
        )}
      </View>

      {/* HMU First upsell */}
      {!isFirst && (
        <DepthButton
          onPress={() => { hapticMedium(); router.push('/(driver)/payout-setup'); }}
          style={s.upsell}
        >
          <View style={s.upsellHeader}>
            <Text style={s.upsellTitle}>GO HMU FIRST</Text>
            <Text style={s.upsellPrice}>$9.99/mo</Text>
          </View>
          <Text style={s.upsellBody}>Lower fee cap ($25/day), instant payouts, priority support.</Text>
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

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const PERIODS: Period[] = ['D', 'W', 'M'];
  const LABELS = { D: 'DAY', W: 'WEEK', M: 'MONTH' };
  return (
    <View style={s.toggle}>
      {PERIODS.map((p) => (
        <TouchableOpacity
          key={p}
          style={[s.toggleBtn, value === p && s.toggleBtnActive]}
          onPress={() => onChange(p)}
          activeOpacity={0.8}
        >
          <Text style={[s.toggleText, value === p && s.toggleTextActive]}>
            {LABELS[p]}
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

function CapBar({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = Math.min(1, used / max);
  const barColor = pct > 0.8 ? colors.red : pct > 0.5 ? colors.amber : colors.green;
  return (
    <View style={s.capWrap}>
      <View style={s.capTrack}>
        <View style={[s.capFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
      </View>
      <Text style={s.capText}>${used.toFixed(2)} / ${max} {label}</Text>
    </View>
  );
}

function BarChart({ bars }: { bars: BarPoint[] }) {
  const max = Math.max(...bars.map((b) => b.kept), 1);
  return (
    <View style={s.chart}>
      {bars.map((bar, i) => {
        const pct = bar.kept / max;
        return (
          <View key={i} style={s.barCol}>
            <Text style={s.barAmount}>${bar.kept > 0 ? bar.kept.toFixed(0) : ''}</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { height: `${Math.max(pct * 100, bar.kept > 0 ? 4 : 0)}%` as any }]} />
            </View>
            <Text style={s.barLabel}>{bar.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function BarSkeleton() {
  const heights = [60, 80, 45, 90, 70, 55, 75];
  return (
    <View style={s.chart}>
      {heights.map((h, i) => (
        <View key={i} style={s.barCol}>
          <View style={s.barTrack}>
            <View style={[s.barFill, s.barSkeleton, { height: `${h}%` as any }]} />
          </View>
          <View style={s.skeletonLabel} />
        </View>
      ))}
    </View>
  );
}

/** Pressable with scale-down depth feedback + haptic */
function DepthButton({
  onPress, style, children,
}: {
  onPress: () => void;
  style?: object;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  function pressIn() {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  }

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 48 },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  headerLeft: { gap: spacing.xs },
  greeting: { fontFamily: fonts.display, fontSize: 36, color: colors.textPrimary, lineHeight: 38 },
  tierBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tierFree: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  tierFirst: { backgroundColor: colors.green },
  tierText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },

  requestsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
  requestsBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.bg, letterSpacing: 1 },

  // Period toggle
  toggle: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { flex: 1, paddingVertical: 9, borderRadius: radius.pill, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.green, shadowColor: colors.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  toggleText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1 },
  toggleTextActive: { color: colors.bg },

  // Earnings card
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.sm, textTransform: 'uppercase' },
  bigAmount: { fontFamily: fonts.display, fontSize: 52, color: colors.green, lineHeight: 54, marginBottom: 2 },
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

  // Chart card
  chartHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 6 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 4 },
  barAmount: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, textAlign: 'center' },
  barTrack: { width: '100%', flex: 1, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden', backgroundColor: colors.cardAlt },
  barFill: { width: '100%', backgroundColor: colors.green, borderRadius: 4 },
  barSkeleton: { backgroundColor: colors.cardAlt, opacity: 0.4 },
  barLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, textAlign: 'center' },
  skeletonLabel: { height: 8, width: 20, backgroundColor: colors.cardAlt, borderRadius: 4, opacity: 0.4 },
  chartEmpty: { height: 80, alignItems: 'center', justifyContent: 'center' },
  chartEmptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center' },

  // HMU First upsell
  upsell: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, borderWidth: 1, borderColor: colors.amberBorder },
  upsellHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  upsellTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.amber },
  upsellPrice: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber },
  upsellBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 20, marginBottom: spacing.lg },
  upsellCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upsellCtaText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, letterSpacing: 1 },
});
