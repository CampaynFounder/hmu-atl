// Driver home — earnings summary, go-live toggle, push token registration.
// APIs: GET /driver/earnings, GET /users/me, POST /users/push-token

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import * as Notifications from 'expo-notifications';
import { apiClient } from '@/lib/api';

interface Earnings {
  today: { gross: number; fees: number; kept: number; rides: number; capHit: boolean; capUsed: number; capMax: number };
  week: { gross: number; fees: number; kept: number; rides: number; capHit: boolean; capUsed: number; capMax: number };
  tier: string;
}

// Register Expo push token with the server once per session
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

    // Register push token once per app session
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
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#00E676" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E676" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Wassup, {handle}</Text>
          {isFirst && (
            <View style={styles.firstBadge}>
              <Text style={styles.firstBadgeText}>HMU FIRST</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.requestsBtn} onPress={() => router.push('/(driver)/feed')}>
          <Text style={styles.requestsBtnText}>View Requests →</Text>
        </TouchableOpacity>
      </View>

      {/* Today earnings card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Today</Text>
        <Text style={styles.bigAmount}>${earnings?.today.kept.toFixed(2) ?? '0.00'}</Text>
        <Text style={styles.subLabel}>kept after fees</Text>
        <View style={styles.row}>
          <StatPill label="Rides" value={String(earnings?.today.rides ?? 0)} />
          <StatPill label="Gross" value={`$${earnings?.today.gross.toFixed(2) ?? '0.00'}`} />
          <StatPill label="Fees" value={`$${earnings?.today.fees.toFixed(2) ?? '0.00'}`} />
        </View>
        {earnings?.today.capHit && (
          <View style={styles.capBanner}>
            <Text style={styles.capBannerText}>Daily cap hit — fee-free until midnight 🎉</Text>
          </View>
        )}
        {!earnings?.today.capHit && (
          <CapBar used={earnings?.today.capUsed ?? 0} max={earnings?.today.capMax ?? 40} label="daily fee cap" />
        )}
      </View>

      {/* Week earnings card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>This Week</Text>
        <Text style={styles.bigAmount}>${earnings?.week.kept.toFixed(2) ?? '0.00'}</Text>
        <Text style={styles.subLabel}>kept after fees</Text>
        <View style={styles.row}>
          <StatPill label="Rides" value={String(earnings?.week.rides ?? 0)} />
          <StatPill label="Gross" value={`$${earnings?.week.gross.toFixed(2) ?? '0.00'}`} />
          <StatPill label="Fees" value={`$${earnings?.week.fees.toFixed(2) ?? '0.00'}`} />
        </View>
        {earnings?.week.capHit && (
          <View style={styles.capBanner}>
            <Text style={styles.capBannerText}>Weekly cap hit — fee-free until Monday 🎉</Text>
          </View>
        )}
      </View>

      {/* HMU First upsell */}
      {!isFirst && (
        <TouchableOpacity style={styles.upsell} onPress={() => router.push('/(driver)/payout-setup')}>
          <Text style={styles.upsellTitle}>Go HMU First</Text>
          <Text style={styles.upsellBody}>Lower fee cap ($25/day), instant payouts. $9.99/mo</Text>
          <Text style={styles.upsellCta}>Upgrade →</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

function CapBar({ used, max, label }: { used: number; max: number; label: string }) {
  const pct = Math.min(1, used / max);
  const color = pct > 0.8 ? '#FF4444' : pct > 0.5 ? '#FFB300' : '#00E676';
  return (
    <View style={styles.capWrap}>
      <View style={styles.capTrack}>
        <View style={[styles.capFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.capText}>${used.toFixed(2)} / ${max} {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { padding: 16, paddingBottom: 40 },
  loader: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingTop: 12 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  firstBadge: { backgroundColor: '#FFB300', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  firstBadgeText: { fontSize: 9, fontWeight: '800', color: '#000', letterSpacing: 1 },
  requestsBtn: { backgroundColor: '#00E676', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  requestsBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },
  card: { backgroundColor: '#18181b', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#27272a' },
  cardLabel: { fontSize: 12, color: '#555', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  bigAmount: { fontSize: 40, fontWeight: '900', color: '#fff', marginBottom: 2 },
  subLabel: { fontSize: 13, color: '#555', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: { flex: 1, backgroundColor: '#27272a', borderRadius: 10, padding: 10, alignItems: 'center' },
  pillValue: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  pillLabel: { fontSize: 11, color: '#555' },
  capBanner: { backgroundColor: '#00E676/10', borderRadius: 8, padding: 10 },
  capBannerText: { fontSize: 13, color: '#00E676', fontWeight: '600', textAlign: 'center' },
  capWrap: { gap: 6 },
  capTrack: { height: 4, backgroundColor: '#27272a', borderRadius: 2, overflow: 'hidden' },
  capFill: { height: '100%', borderRadius: 2 },
  capText: { fontSize: 11, color: '#555' },
  upsell: { backgroundColor: '#18181b', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#FFB300/30' },
  upsellTitle: { fontSize: 17, fontWeight: '800', color: '#FFB300', marginBottom: 4 },
  upsellBody: { fontSize: 14, color: '#888', marginBottom: 12, lineHeight: 20 },
  upsellCta: { fontSize: 14, fontWeight: '700', color: '#FFB300' },
});
