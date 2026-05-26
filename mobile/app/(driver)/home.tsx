import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface Earnings {
  today: { gross: number; fees: number; kept: number; rides: number; capHit: boolean; capUsed: number; capMax: number };
  week: { gross: number; fees: number; kept: number; rides: number; capHit: boolean; capUsed: number; capMax: number };
  tier: string;
}

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

export default function DriverHome() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const tokenRegistered = useRef(false);

  const fetchEarnings = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await apiClient<Earnings>('/driver/earnings', token);
      setEarnings(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [getToken]);

  useEffect(() => {
    void fetchEarnings();
    if (!tokenRegistered.current) {
      tokenRegistered.current = true;
      getToken().then((t) => { if (t) void registerPushToken(t); }).catch(() => {});
    }
  }, [fetchEarnings, getToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void fetchEarnings();
  }, [fetchEarnings]);

  const handle = (user?.unsafeMetadata?.handle as string) ?? user?.fullName ?? 'Driver';
  const isFirst = (user?.publicMetadata?.tier as string) === 'hmu_first';

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
    >
      {/* Greeting */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.greeting}>{handle.toUpperCase()}</Text>
          <View style={[s.tierBadge, isFirst ? s.tierBadgeFirst : s.tierBadgeFree]}>
            <Text style={[s.tierBadgeText, isFirst ? { color: colors.bg } : {}]}>
              {isFirst ? 'HMU FIRST' : 'FREE TIER'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={s.requestsBtn} onPress={() => router.push('/(driver)/feed')}>
          <Text style={s.requestsBtnText}>REQUESTS</Text>
          <Ionicons name="layers-outline" size={14} color={colors.bg} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      </View>

      {/* Today card */}
      <EarningsCard
        label="TODAY"
        kept={earnings?.today.kept ?? 0}
        gross={earnings?.today.gross ?? 0}
        fees={earnings?.today.fees ?? 0}
        rides={earnings?.today.rides ?? 0}
        capHit={earnings?.today.capHit ?? false}
        capUsed={earnings?.today.capUsed ?? 0}
        capMax={earnings?.today.capMax ?? 40}
        capLabel="daily fee cap"
      />

      {/* Week card */}
      <EarningsCard
        label="THIS WEEK"
        kept={earnings?.week.kept ?? 0}
        gross={earnings?.week.gross ?? 0}
        fees={earnings?.week.fees ?? 0}
        rides={earnings?.week.rides ?? 0}
        capHit={earnings?.week.capHit ?? false}
        capUsed={earnings?.week.capUsed ?? 0}
        capMax={earnings?.week.capMax ?? 200}
        capLabel="weekly fee cap"
      />

      {/* HMU First upsell */}
      {!isFirst && (
        <TouchableOpacity style={s.upsell} onPress={() => router.push('/(driver)/payout-setup')}>
          <View style={s.upsellHeader}>
            <Text style={s.upsellTitle}>GO HMU FIRST</Text>
            <Text style={s.upsellBadge}>$9.99/mo</Text>
          </View>
          <Text style={s.upsellBody}>Lower fee cap ($25/day), instant payouts, priority support.</Text>
          <View style={s.upsellCta}>
            <Text style={s.upsellCtaText}>UPGRADE</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.green} />
          </View>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function EarningsCard({
  label, kept, gross, fees, rides,
  capHit, capUsed, capMax, capLabel,
}: {
  label: string; kept: number; gross: number; fees: number; rides: number;
  capHit: boolean; capUsed: number; capMax: number; capLabel: string;
}) {
  const pct = Math.min(1, capUsed / capMax);
  const barColor = pct > 0.8 ? colors.red : pct > 0.5 ? colors.amber : colors.green;

  return (
    <View style={[s.card, shadow.card]}>
      <Text style={s.cardLabel}>{label}</Text>
      <Text style={s.bigAmount}>${kept.toFixed(2)}</Text>
      <Text style={s.subLabel}>kept after fees</Text>

      <View style={s.pillRow}>
        <Pill label="RIDES" value={String(rides)} />
        <Pill label="GROSS" value={`$${gross.toFixed(2)}`} />
        <Pill label="FEES" value={`$${fees.toFixed(2)}`} />
      </View>

      {capHit ? (
        <View style={s.capBanner}>
          <Text style={s.capBannerText}>🎉 Cap hit — fee-free for the rest of the period</Text>
        </View>
      ) : (
        <View style={s.capWrap}>
          <View style={s.capTrack}>
            <View style={[s.capFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
          </View>
          <Text style={s.capText}>${capUsed.toFixed(2)} / ${capMax} {capLabel}</Text>
        </View>
      )}
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: 48 },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xxl, paddingTop: spacing.md },
  headerLeft: { gap: spacing.xs },
  greeting: { fontFamily: fonts.display, fontSize: 36, color: colors.textPrimary, lineHeight: 38 },
  tierBadge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  tierBadgeFree: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  tierBadgeFirst: { backgroundColor: colors.green },
  tierBadgeText: { fontFamily: fonts.mono, fontSize: 10, fontWeight: '700', color: colors.textTertiary, letterSpacing: 1 },
  requestsBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
  requestsBtnText: { fontFamily: fonts.mono, fontSize: 11, fontWeight: '700', color: colors.bg, letterSpacing: 1 },

  // Card
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

  // HMU First upsell
  upsell: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, borderWidth: 1, borderColor: colors.amberBorder },
  upsellHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  upsellTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.amber },
  upsellBadge: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber, letterSpacing: 0.5 },
  upsellBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 20, marginBottom: spacing.lg },
  upsellCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  upsellCtaText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, fontWeight: '700', letterSpacing: 1 },
});
