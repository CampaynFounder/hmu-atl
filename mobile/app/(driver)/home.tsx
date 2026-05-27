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
type ActiveTile = 'all' | 'cash' | 'digital' | 'noshow';

interface TimeseriesPoint {
  day: string;
  cash: number;
  nonCash: number;
  rides: number;
}

interface AnalyticsResponse {
  timeseries: TimeseriesPoint[];
}

interface BarPoint { label: string; value: number; }

interface UserMeResponse {
  id: string;
  profileType: string;
  accountStatus: string;
  driverHandle: string | null;
}

interface BalanceResponse {
  available: number;
  pending: number;
  instantAvailable: number;
  instantEligible: boolean;
  platformInstantEnabled: boolean;
  fundsAvailableOn: string | null;
  tier: string;
  currency: string;
  payoutStatus: 'no_balance' | 'ready' | 'pending_hold' | 'instant_only';
  cashEarnings: { rides: number; total: number };
  digitalEarnings: { rides: number; total: number };
  noShowEarnings: { rides: number; total: number };
  flags: { depositsDetailSheet: boolean };
}

interface CashoutResult {
  success?: boolean;
  amount?: number;
  arrival?: string;
  error?: string;
  errorType?: string;
  detail?: string;
}

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

// Returns [] for 'noshow' since that data isn't in the timeseries
function buildWalletBars(ts: TimeseriesPoint[], period: Period, tile: ActiveTile): BarPoint[] {
  if (!ts?.length || tile === 'noshow') return [];

  function val(p: TimeseriesPoint): number {
    if (tile === 'cash') return p.cash;
    if (tile === 'digital') return p.nonCash;
    return p.cash + p.nonCash;
  }

  if (period === 'D') {
    return ts.slice(-7).map((p) => ({
      label: new Date(p.day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
      value: Math.round(val(p) * 100) / 100,
    }));
  }

  if (period === 'W') {
    const weeks: Record<string, number> = {};
    ts.slice(-28).forEach((p) => {
      const d = new Date(p.day + 'T12:00:00');
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay());
      const key = ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      weeks[key] = (weeks[key] ?? 0) + val(p);
    });
    return Object.entries(weeks).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
  }

  const months: Record<string, number> = {};
  ts.forEach((p) => {
    const key = new Date(p.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' });
    months[key] = (months[key] ?? 0) + val(p);
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
    const id = animVal.addListener(({ value }) => setDisplay(value.toFixed(2)));
    Animated.timing(animVal, {
      toValue: target,
      duration: target === 0 ? 900 : 1100,
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

  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [driverHandle, setDriverHandle] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const tokenRegistered = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      const token = await getToken();
      setAuthToken(token);
      const [analyticsData, meData, balanceData] = await Promise.allSettled([
        apiClient<AnalyticsResponse>('/driver/analytics', token),
        apiClient<UserMeResponse>('/users/me', token),
        apiClient<BalanceResponse>('/driver/balance', token),
      ]);
      if (analyticsData.status === 'fulfilled') setTimeseries(analyticsData.value.timeseries ?? []);
      if (meData.status === 'fulfilled' && meData.value.driverHandle) {
        setDriverHandle(meData.value.driverHandle);
      }
      if (balanceData.status === 'fulfilled') setBalance(balanceData.value);
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

  const handle = driverHandle ?? (user?.fullName ?? 'Driver');
  const isFirst = (user?.publicMetadata?.tier as string) === 'hmu_first';

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
        <Text style={s.greeting}>{handle.toUpperCase()}</Text>
        <DepthButton
          onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); router.push('/(driver)/feed'); }}
          style={s.requestsBtn}
        >
          <Text style={s.requestsBtnText}>REQUESTS</Text>
          <Ionicons name="layers-outline" size={13} color={colors.bg} style={{ marginLeft: 4 }} />
        </DepthButton>
      </View>

      {/* Unified wallet card */}
      {balance
        ? (
          <DriverWalletCard
            balance={balance}
            timeseries={timeseries}
            token={authToken}
            onRefresh={onRefresh}
            isFirst={isFirst}
          />
        )
        : (
          <View style={[s.card, shadow.card, { alignItems: 'center', paddingVertical: 40 }]}>
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.textFaint }}>
              Could not load balance
            </Text>
          </View>
        )
      }

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

// ── DriverWalletCard ──────────────────────────────────────────────────────────

function DriverWalletCard({
  balance, timeseries, token, onRefresh, isFirst,
}: {
  balance: BalanceResponse;
  timeseries: TimeseriesPoint[];
  token: string | null;
  onRefresh: () => void;
  isFirst: boolean;
}) {
  const [period, setPeriod] = useState<Period>('D');
  const [activeTile, setActiveTile] = useState<ActiveTile>('all');
  const [method, setMethod] = useState<'standard' | 'instant'>('standard');
  const [cashing, setCashing] = useState(false);
  const [result, setResult] = useState<CashoutResult | null>(null);
  const [localRefreshing, setLocalRefreshing] = useState(false);

  const showInstant = balance.instantEligible && balance.platformInstantEnabled;
  const cashableAmount = method === 'instant' ? balance.instantAvailable : balance.available;
  const bars = buildWalletBars(timeseries, period, activeTile);

  const cashTotal = balance.cashEarnings?.total ?? 0;
  const digitalTotal = balance.digitalEarnings?.total ?? 0;
  const noShowTotal = balance.noShowEarnings?.total ?? 0;
  const hasNoShow = (balance.noShowEarnings?.rides ?? 0) > 0 || noShowTotal > 0;

  function selectTile(tile: ActiveTile) {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setActiveTile((prev) => (prev === tile ? 'all' : tile));
  }

  function selectPeriod(p: Period) {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setPeriod(p);
  }

  function handleRefresh() {
    if (localRefreshing) return;
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setLocalRefreshing(true);
    onRefresh();
    setTimeout(() => setLocalRefreshing(false), 1200);
  }

  async function doCashout() {
    if (cashing || cashableAmount <= 0) return;
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    setCashing(true);
    setResult(null);
    try {
      const data = await apiClient<CashoutResult>('/driver/cashout', token, {
        method: 'POST',
        body: JSON.stringify({ method }),
      });
      setResult(data);
      if (data.success) {
        haptic(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(onRefresh, 1500);
      }
    } catch {
      setResult({ error: 'Something went wrong. Try again.' });
    } finally {
      setCashing(false);
    }
  }

  const cardBorder = cashableAmount > 0 ? colors.greenBorder : colors.border;

  return (
    <View style={[s.card, shadow.card, { borderColor: cardBorder, marginBottom: spacing.lg }]}>

      {/* ── Header row ── */}
      <View style={wc.headerRow}>
        <View style={[s.tierBadge, isFirst ? s.tierFirst : s.tierFree]}>
          <Text style={[s.tierText, isFirst && { color: colors.bg }]}>
            {isFirst ? 'HMU FIRST' : 'FREE TIER'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={wc.refreshBtn} activeOpacity={0.7}>
          <Ionicons
            name={localRefreshing ? 'sync-outline' : 'refresh-outline'}
            size={13}
            color={colors.green}
          />
          <Text style={wc.refreshText}>{localRefreshing ? 'CHECKING' : 'REFRESH'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Hero balance ── */}
      <Text style={s.cardLabel}>WALLET</Text>
      <AnimatedHeroAmount value={cashableAmount} />
      <Text style={[s.subLabel, { marginBottom: balance.pending > 0 ? spacing.xs : spacing.lg }]}>
        {cashableAmount > 0 ? 'ready to cash out' : balance.pending > 0 ? 'funds settling' : 'no balance yet'}
      </Text>

      {/* ── Pending line ── */}
      {balance.pending > 0 && <PendingLine pending={balance.pending} fundsAvailableOn={balance.fundsAvailableOn} />}

      {/* ── Earnings tiles ── */}
      <View style={wc.tilesRow}>
        <EarningsTile
          label="CASH"
          amount={cashTotal}
          rides={balance.cashEarnings?.rides ?? 0}
          accentColor={colors.cash}
          accentDim={colors.cashDim}
          accentBorder={colors.cashBorder}
          active={activeTile === 'cash'}
          onPress={() => selectTile('cash')}
        />
        <EarningsTile
          label="DEPOSITS"
          amount={digitalTotal}
          rides={balance.digitalEarnings?.rides ?? 0}
          accentColor={colors.green}
          accentDim={colors.greenDim}
          accentBorder={colors.greenBorder}
          active={activeTile === 'digital'}
          onPress={() => selectTile('digital')}
          hasArrow
        />
        {hasNoShow && (
          <EarningsTile
            label="NO-SHOW"
            amount={noShowTotal}
            rides={balance.noShowEarnings?.rides ?? 0}
            accentColor={colors.pink}
            accentDim={colors.pinkDim}
            accentBorder={colors.pinkBorder}
            active={activeTile === 'noshow'}
            onPress={() => selectTile('noshow')}
          />
        )}
      </View>

      {/* ── Period toggle ── */}
      <View style={wc.periodRow}>
        {(['D', 'W', 'M'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[wc.periodBtn, period === p && wc.periodActive]}
            onPress={() => selectPeriod(p)}
            activeOpacity={0.8}
          >
            <Text style={[wc.periodText, period === p && wc.periodTextActive]}>
              {p === 'D' ? 'DAY' : p === 'W' ? 'WEEK' : 'MONTH'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Chart ── */}
      {activeTile === 'noshow' ? (
        <View style={wc.noShowChart}>
          <Ionicons name="shield-checkmark-outline" size={26} color={colors.pink} />
          <Text style={wc.noShowText}>
            {noShowTotal > 0
              ? `$${noShowTotal.toFixed(2)} from ${balance.noShowEarnings?.rides} no-show${(balance.noShowEarnings?.rides ?? 0) !== 1 ? 's' : ''}`
              : 'You get paid when riders ghost'}
          </Text>
        </View>
      ) : bars.length > 0 ? (
        <AnimatedBarChart bars={bars} />
      ) : (
        <View style={wc.chartEmpty}>
          <Text style={wc.chartEmptyText}>Complete a ride to see your chart</Text>
        </View>
      )}

      {/* ── Divider ── */}
      <View style={wc.divider} />

      {/* ── Result feedback ── */}
      {result?.success && (
        <View style={wc.successBox}>
          <Ionicons name="checkmark-circle" size={16} color={colors.green} />
          <Text style={wc.successText}>
            ${result.amount?.toFixed(2)} on the way · {result.arrival}
          </Text>
        </View>
      )}
      {result?.errorType === 'pending_hold' && (
        <View style={[wc.infoBox, { backgroundColor: colors.amberDim, borderColor: colors.amberBorder }]}>
          <Ionicons name="time-outline" size={14} color={colors.amber} style={{ marginTop: 1 }} />
          <Text style={[wc.infoText, { flex: 1 }]}>{result.detail}</Text>
        </View>
      )}
      {result?.errorType === 'instant_limit' && (
        <View style={[wc.infoBox, { backgroundColor: colors.blueDim, borderColor: colors.blueBorder }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.blue} style={{ marginTop: 1 }} />
          <Text style={[wc.infoText, { flex: 1, color: colors.textSecondary }]}>{result.detail}</Text>
        </View>
      )}
      {result?.error && !result.errorType && (
        <View style={[wc.infoBox, { backgroundColor: colors.redDim, borderColor: colors.redBorder }]}>
          <Text style={[wc.infoText, { color: colors.red }]}>{result.error}</Text>
        </View>
      )}

      {/* ── Method toggle (Standard / Instant) ── */}
      {showInstant && !result?.success && (
        <View style={wc.methodRow}>
          {(['standard', 'instant'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[wc.methodBtn, method === m && wc.methodActive]}
              onPress={() => { haptic(); setMethod(m); setResult(null); }}
              activeOpacity={0.8}
            >
              <Text style={[wc.methodLabel, method === m && wc.methodLabelActive]}>
                {m === 'standard' ? 'STANDARD' : '⚡ INSTANT'}
              </Text>
              <Text style={[wc.methodSub, method === m && { color: colors.bg }]}>
                {m === 'standard' ? '1-2 days · free' : 'minutes · free'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── CTA ── */}
      {!result?.success && (
        <DepthButton
          onPress={doCashout}
          style={[wc.cashoutBtn, (cashing || cashableAmount <= 0) && { opacity: 0.45 }]}
        >
          {cashing ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={wc.cashoutBtnText}>
                {cashableAmount > 0
                  ? `CASH OUT $${cashableAmount.toFixed(2)}`
                  : balance.pending > 0
                    ? 'FUNDS SETTLING'
                    : 'COMPLETE A RIDE'}
              </Text>
              {cashableAmount > 0 && (
                <Ionicons name="arrow-forward" size={14} color={colors.bg} style={{ marginLeft: 6 }} />
              )}
            </View>
          )}
        </DepthButton>
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AnimatedHeroAmount({ value }: { value: number }) {
  const display = useAnimatedAmount(value);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 2 }}>
      <Text style={wc.heroSign}>$</Text>
      <Text style={wc.heroAmount}>{display}</Text>
    </View>
  );
}

function PendingLine({ pending, fundsAvailableOn }: { pending: number; fundsAvailableOn: string | null }) {
  const display = useAnimatedAmount(pending);
  const dateLabel = fundsAvailableOn
    ? new Date(fundsAvailableOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'soon';
  return (
    <View style={wc.pendingRow}>
      <Ionicons name="time-outline" size={11} color={colors.amber} />
      <Text style={wc.pendingAmt}>${display}</Text>
      <Text style={wc.pendingLabel}>arriving {dateLabel}</Text>
    </View>
  );
}

function EarningsTile({
  label, amount, rides, accentColor, accentDim, accentBorder,
  active, onPress, hasArrow,
}: {
  label: string; amount: number; rides: number;
  accentColor: string; accentDim: string; accentBorder: string;
  active: boolean; onPress: () => void; hasArrow?: boolean;
}) {
  const display = useAnimatedAmount(amount);
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 3 }).start();

  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={{ flex: 1 }}>
      <Animated.View style={[
        wc.tile,
        {
          backgroundColor: active ? accentDim : 'transparent',
          borderColor: active ? accentBorder : colors.border,
        },
        { transform: [{ scale }] },
      ]}>
        <View style={wc.tileLabelRow}>
          <Text style={[wc.tileLabel, { color: accentColor }]}>{label}</Text>
          {hasArrow && <Text style={[wc.tileChevron, { color: accentColor }]}>›</Text>}
        </View>
        <Text style={[wc.tileAmount, { color: accentColor }]}>${display}</Text>
        <Text style={wc.tileRides}>{rides} ride{rides !== 1 ? 's' : ''}</Text>
      </Animated.View>
    </Pressable>
  );
}

// Animated bar chart — bars spring from 0 to target height on mount and on
// any change to the bars array (period switch or tile filter).
const MAX_BARS = 12;

function AnimatedBarChart({ bars }: { bars: BarPoint[] }) {
  const animVals = useRef<Animated.Value[]>(
    Array.from({ length: MAX_BARS }, () => new Animated.Value(0))
  ).current;
  const prevLabels = useRef<string[]>([]);

  useEffect(() => {
    if (!bars.length) return;
    const max = Math.max(...bars.map((b) => b.value), 1);

    const labelsChanged =
      bars.length !== prevLabels.current.length ||
      bars.some((b, i) => b.label !== prevLabels.current[i]);

    if (labelsChanged) {
      animVals.forEach((av) => av.setValue(0));
    }

    prevLabels.current = bars.map((b) => b.label);

    Animated.stagger(
      40,
      bars.map((bar, i) =>
        Animated.spring(animVals[i], {
          toValue: Math.max((bar.value / max) * 100, bar.value > 0 ? 5 : 0),
          useNativeDriver: false,
          speed: 14,
          bounciness: 3,
        })
      )
    ).start();
  }, [bars, animVals]);

  return (
    <View style={wc.chart}>
      {bars.map((bar, i) => (
        <View key={bar.label} style={wc.barCol}>
          {bar.value > 0 && (
            <Text style={wc.barAmt}>
              ${bar.value >= 100 ? Math.round(bar.value) : bar.value.toFixed(0)}
            </Text>
          )}
          <View style={wc.barTrack}>
            <Animated.View
              style={[
                wc.barFill,
                {
                  height: animVals[i].interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={wc.barLabel}>{bar.label}</Text>
        </View>
      ))}
    </View>
  );
}

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

// ── Page-level styles ─────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 48 },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  greeting: { fontFamily: fonts.display, fontSize: 36, color: colors.textPrimary, lineHeight: 38 },
  requestsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  requestsBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.bg, letterSpacing: 1 },

  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.sm },
  subLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },

  tierBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tierFree: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  tierFirst: { backgroundColor: colors.green },
  tierText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },

  upsell: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, borderWidth: 1, borderColor: colors.amberBorder },
  upsellRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  upsellTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.amber },
  upsellPrice: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber },
  upsellBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 20, marginBottom: spacing.lg },
  upsellCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upsellCtaText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, letterSpacing: 1 },
});

// ── Wallet card styles ────────────────────────────────────────────────────────

const wc = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder },
  refreshText: { fontFamily: fonts.mono, fontSize: 9, color: colors.green, letterSpacing: 1 },

  heroSign: { fontFamily: fonts.display, fontSize: 26, color: colors.green, lineHeight: 56, marginRight: 2 },
  heroAmount: { fontFamily: fonts.display, fontSize: 52, color: colors.green, lineHeight: 56 },

  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.lg, marginTop: spacing.xs },
  pendingAmt: { fontFamily: fonts.mono, fontSize: 12, color: colors.amber },
  pendingLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },

  tilesRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, marginTop: spacing.sm },
  tile: { borderRadius: radius.cardInner, padding: spacing.md, borderWidth: 1 },
  tileLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tileLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  tileChevron: { fontSize: 14, lineHeight: 14 },
  tileAmount: { fontFamily: fonts.display, fontSize: 18, lineHeight: 20, marginBottom: 2 },
  tileRides: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint },

  periodRow: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  periodBtn: { flex: 1, paddingVertical: 7, borderRadius: radius.pill, alignItems: 'center' },
  periodActive: { backgroundColor: colors.green, shadowColor: colors.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  periodText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
  periodTextActive: { color: colors.bg },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 4, marginBottom: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 3 },
  barAmt: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, textAlign: 'center' },
  barTrack: { width: '100%', flex: 1, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden', backgroundColor: colors.cardAlt },
  barFill: { width: '100%', backgroundColor: colors.green, borderRadius: 4 },
  barLabel: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, textAlign: 'center' },
  chartEmpty: { height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  chartEmptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
  noShowChart: { height: 80, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  noShowText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.pink, textAlign: 'center' },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },

  successBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.greenDim, borderRadius: radius.tag, padding: spacing.md, borderWidth: 1, borderColor: colors.greenBorder, marginBottom: spacing.md },
  successText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.green },

  infoBox: { flexDirection: 'row', gap: spacing.sm, borderRadius: radius.tag, padding: spacing.md, borderWidth: 1, marginBottom: spacing.md },
  infoText: { fontFamily: fonts.body, fontSize: 12, color: colors.amber, lineHeight: 18 },

  methodRow: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  methodBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  methodActive: { backgroundColor: colors.green, shadowColor: colors.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  methodLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
  methodLabelActive: { color: colors.bg },
  methodSub: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 1 },

  cashoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green, borderRadius: radius.pill, paddingVertical: 15 },
  cashoutBtnText: { fontFamily: fonts.mono, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
});
