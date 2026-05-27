import { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import type { RideRecord } from '../rides';

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

function statusMeta(s: string | null | undefined) {
  if (!s) return { label: 'UNKNOWN', color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
  return STATUS[s] ?? { label: s.toUpperCase(), color: colors.textFaint, bg: colors.cardAlt, border: colors.border };
}

function formatTs(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function StarRow({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          name={n <= Math.round(rating) ? 'star' : 'star-outline'}
          size={14}
          color={colors.amber}
        />
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RideDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; d: string }>();

  // Card stagger animations
  const anims = useRef([0, 1, 2, 3, 4].map(() => ({
    opacity: new Animated.Value(0),
    y: new Animated.Value(14),
  }))).current;

  useEffect(() => {
    Animated.stagger(
      70,
      anims.map(({ opacity, y }) =>
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(y, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ])
      )
    ).start();
  }, []);

  if (!params.d) {
    return (
      <View style={[s.loader, { paddingTop: insets.top }]}>
        <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.textFaint }}>
          Ride not found
        </Text>
      </View>
    );
  }

  const ride: RideRecord = JSON.parse(params.d);
  const meta = statusMeta(ride.status);
  const isActive = ['pending', 'matched', 'accepted', 'otw', 'here', 'active', 'in_progress'].includes(ride.status);

  const gross = Number(ride.final_agreed_price ?? ride.amount ?? 0);
  const fee = Number(ride.platform_fee_amount ?? 0);
  const kept = Number(ride.driver_payout_amount ?? (gross - fee));

  function card(index: number, children: React.ReactNode, extraStyle?: object) {
    const { opacity, y } = anims[index];
    return (
      <Animated.View style={[s.card, shadow.card, extraStyle, { opacity, transform: [{ translateY: y }] }]}>
        {children}
      </Animated.View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Nav bar ── */}
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>RIDE DETAIL</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status hero ── */}
        {card(0,
          <View style={s.heroInner}>
            <View style={[s.statusPill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
              <Text style={[s.statusLabel, { color: meta.color }]}>{meta.label}</Text>
            </View>
            {ride.ref_code && (
              <Text style={s.refCode}>REF {ride.ref_code}</Text>
            )}
            <Text style={s.heroDate}>{formatTs(ride.created_at)}</Text>
          </View>,
          { borderColor: meta.border }
        )}

        {/* ── Route card ── */}
        {card(1,
          <>
            <Text style={s.cardLabel}>ROUTE</Text>
            <View style={s.routeWrap}>
              {/* From */}
              <View style={s.routeStop}>
                <View style={s.routeIconCol}>
                  <View style={s.dotFrom} />
                  <View style={s.routeConnector} />
                </View>
                <View style={s.routeTextCol}>
                  <Text style={s.stopType}>PICKUP</Text>
                  <Text style={s.stopAddr}>{ride.pickup_address ?? '—'}</Text>
                </View>
              </View>
              {/* To */}
              <View style={s.routeStop}>
                <View style={s.routeIconCol}>
                  <Ionicons name="location" size={13} color={colors.green} />
                </View>
                <View style={s.routeTextCol}>
                  <Text style={s.stopType}>DROPOFF</Text>
                  <Text style={s.stopAddr}>{ride.dropoff_address ?? ride.destination ?? '—'}</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── Earnings card ── */}
        {card(2,
          <>
            <Text style={s.cardLabel}>EARNINGS</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              <AmountPill label="GROSS" value={`$${gross.toFixed(2)}`} color={colors.textPrimary} />
              <AmountPill label="FEES" value={fee > 0 ? `-$${fee.toFixed(2)}` : '$0.00'} color={fee > 0 ? colors.red : colors.textFaint} />
              <AmountPill label="KEPT" value={`$${kept.toFixed(2)}`} color={colors.green} highlight />
            </View>
            <View style={[s.typePill, ride.is_cash
              ? { backgroundColor: colors.cashDim, borderColor: colors.cashBorder }
              : { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }
            ]}>
              <Ionicons
                name={ride.is_cash ? 'cash-outline' : 'card-outline'}
                size={12}
                color={ride.is_cash ? colors.cash : colors.green}
              />
              <Text style={[s.typeText, { color: ride.is_cash ? colors.cash : colors.green }]}>
                {ride.is_cash ? 'CASH RIDE' : 'DIGITAL RIDE'}
              </Text>
            </View>
          </>
        )}

        {/* ── Rider card ── */}
        {(ride.rider_handle || ride.rider_name) && card(3,
          <>
            <Text style={s.cardLabel}>RIDER</Text>
            <View style={s.riderRow}>
              <View style={s.avatar}>
                <Text style={s.avatarLetter}>
                  {(ride.rider_handle ?? ride.rider_name ?? '?')[0].toUpperCase()}
                </Text>
              </View>
              <View>
                {ride.rider_handle && <Text style={s.riderHandle}>@{ride.rider_handle}</Text>}
                {ride.rider_name && <Text style={s.riderName}>{ride.rider_name}</Text>}
              </View>
              {ride.rider_rating != null && (
                <View style={{ marginLeft: 'auto' as any }}>
                  <StarRow rating={ride.rider_rating} />
                  <Text style={s.ratingVal}>{ride.rider_rating.toFixed(1)} / 5</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Timeline card ── */}
        {card(4,
          <>
            <Text style={s.cardLabel}>TIMELINE</Text>
            <TimelineRow icon="ellipse" label="REQUESTED" value={formatTs(ride.created_at)} active />
            <TimelineRow icon="checkmark-circle" label="STARTED" value={formatTs(ride.started_at)} active={ride.started_at != null} />
            <TimelineRow icon="flag" label="ENDED" value={formatTs(ride.ended_at)} active={ride.ended_at != null} last />
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AmountPill({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <View style={[s.amountPill, highlight && { borderColor: colors.greenBorder, backgroundColor: colors.greenDim }]}>
      <Text style={s.amountPillLabel}>{label}</Text>
      <Text style={[s.amountPillValue, { color }]}>{value}</Text>
    </View>
  );
}

function TimelineRow({ icon, label, value, active, last }: {
  icon: string; label: string; value: string; active: boolean; last?: boolean;
}) {
  return (
    <View style={tl.row}>
      <View style={tl.iconCol}>
        <Ionicons
          name={icon as any}
          size={14}
          color={active ? colors.green : colors.textFaint}
        />
        {!last && <View style={[tl.line, !active && { backgroundColor: colors.border }]} />}
      </View>
      <View style={tl.textCol}>
        <Text style={[tl.label, !active && { color: colors.textFaint }]}>{label}</Text>
        <Text style={[tl.value, !active && { color: colors.textFaint }]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  navbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },

  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.md },

  heroInner: { alignItems: 'flex-start', gap: spacing.sm },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1 },
  statusLabel: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1.5 },
  refCode: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, letterSpacing: 1 },
  heroDate: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },

  routeWrap: { gap: spacing.sm },
  routeStop: { flexDirection: 'row', gap: spacing.md },
  routeIconCol: { width: 16, alignItems: 'center', paddingTop: 2 },
  dotFrom: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textFaint, marginTop: 2 },
  routeConnector: { flex: 1, width: 1, backgroundColor: colors.border, marginVertical: 4 },
  routeTextCol: { flex: 1, paddingBottom: spacing.md },
  stopType: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5, marginBottom: 4 },
  stopAddr: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  amountPill: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.cardInner, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  amountPillLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1, marginBottom: 4 },
  amountPillValue: { fontFamily: fonts.display, fontSize: 20 },

  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1 },
  typeText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },

  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  avatarLetter: { fontFamily: fonts.display, fontSize: 22, color: colors.green },
  riderHandle: { fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary, letterSpacing: 0.5 },
  riderName: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  ratingVal: { fontFamily: fonts.mono, fontSize: 10, color: colors.amber, marginTop: 4, textAlign: 'right' },
});

const tl = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  iconCol: { width: 20, alignItems: 'center' },
  line: { flex: 1, width: 1, backgroundColor: colors.green, marginTop: 4, minHeight: 20 },
  textCol: { flex: 1, paddingBottom: spacing.sm },
  label: { fontFamily: fonts.mono, fontSize: 9, color: colors.green, letterSpacing: 1.5, marginBottom: 3 },
  value: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
