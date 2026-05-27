// Driver requests feed — incoming blast requests.
// APIs: GET /drivers/requests, POST /bookings/{id}/accept, POST /bookings/{id}/decline
// Ably: user:{driverId}:notify → blast_invite / blast_expired triggers refetch

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useAbly } from '@/hooks/use-ably';
import { useNotifications } from '@/contexts/notifications';

// Matches the camelCase shape returned by GET /api/drivers/requests
interface BlastRequest {
  id: string;
  type: 'blast' | 'direct' | 'open';
  locked: boolean;
  targetId: string | null;
  riderName: string;
  riderHandle: string | null;
  riderAvatarUrl: string | null;
  riderChillScore: number;
  riderCompletedRides: number;
  isCash: boolean;
  pickupAreaSlug: string | null;
  dropoffAreaSlug: string | null;
  pickupAddress: string;
  destination: string;
  time: string;
  price: number;
  expiresAt: string;
  createdAt: string;
  riderOnline: boolean;
  // local-only: set after driver taps HMU so the card flips immediately
  _hmuAt?: string;
}

export default function DriverFeed() {
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [requests, setRequests] = useState<BlastRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const driverId = user?.publicMetadata?.databaseId as string | undefined;
  const { registerFeedRefresh } = useNotifications();

  useEffect(() => {
    getToken().then(setToken).catch(() => {});
    const interval = setInterval(() => getToken().then(setToken).catch(() => {}), 60_000);
    return () => clearInterval(interval);
  }, [getToken]);

  const fetchRequests = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<{ requests: BlastRequest[] }>('/drivers/requests', t);
      setRequests(data.requests ?? []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [getToken]);

  useEffect(() => { void fetchRequests(); }, [fetchRequests]);

  // Register with the global notification context so events arriving while the
  // driver is on a different screen (e.g. ride/active) still clear stale cards.
  useEffect(() => {
    return registerFeedRefresh(() => { void fetchRequests(); });
  }, [fetchRequests, registerFeedRefresh]);

  useAbly({
    channelName: driverId ? `user:${driverId}:notify` : null,
    token,
    onMessage: (msg) => {
      // direct_booking_request fires when a rider specifically books this driver.
      // blast_invite fires when the market fan-out includes this driver.
      if (
        msg.name === 'blast_invite' ||
        msg.name === 'blast_cancelled' ||
        msg.name === 'direct_booking_request'
      ) {
        void fetchRequests();
      }
      if (msg.name === 'blast_expired') {
        const d = msg.data as Record<string, unknown>;
        const blastId = d?.blastId as string | undefined;
        if (blastId) {
          setRequests((prev) => prev.filter((r) => r.id !== blastId));
        }
      }
      // Rider cancelled a matched ride while driver was still on the feed
      if (msg.name === 'ride_update') {
        const d = msg.data as Record<string, unknown>;
        if (d?.status === 'cancelled') {
          Alert.alert('Ride Cancelled', 'The rider cancelled this ride.', [{ text: 'OK' }]);
          void fetchRequests();
        }
      }

      // blast request: rider selected this driver
      if (msg.name === 'blast_match_won') {
        const d = msg.data as Record<string, unknown>;
        const rideId = d?.rideId as string | undefined;
        if (rideId) {
          router.push({ pathname: '/(driver)/ride/active' as any, params: { rideId } });
        }
      }
      // open rider_request: rider picked this driver from the interested pool
      if (msg.name === 'booking_accepted') {
        const d = msg.data as Record<string, unknown>;
        const rideId = d?.rideId as string | undefined;
        if (rideId) {
          router.push({ pathname: '/(driver)/ride/active' as any, params: { rideId } });
        }
      }
    },
  });

  const onRefresh = useCallback(() => { setRefreshing(true); void fetchRequests(); }, [fetchRequests]);

  async function handleHmu(request: BlastRequest) {
    setActing(request.id);
    try {
      const t = await getToken();
      const res = await apiClient<{ status: string; rideId?: string }>(`/bookings/${request.id}/accept`, t, { method: 'POST' });
      // Direct booking match — go straight to the active ride screen
      if (res.rideId) {
        router.push({ pathname: '/(driver)/ride/active' as any, params: { rideId: res.rideId } });
        return;
      }
      // Blast / open request — flip card to HMU Sent state
      setRequests((prev) => prev.map((r) => r.id === request.id ? { ...r, _hmuAt: new Date().toISOString() } : r));
    } catch (e: any) {
      Alert.alert('Could not HMU', e.message ?? 'Try again');
    } finally {
      setActing(null);
    }
  }

  async function handlePass(request: BlastRequest) {
    // Optimistically remove the card immediately
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
    const t = await getToken();
    apiClient(`/bookings/${request.id}/decline`, t, { method: 'POST' }).catch(() => {});
  }

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const active = requests.filter((r) => !r._hmuAt);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>INCOMING REQUESTS</Text>
        {active.length > 0 && (
          <View style={s.countBadge}>
            <Text style={s.countText}>{active.length}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={active}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>👀</Text>
            <Text style={s.emptyTitle}>No requests right now</Text>
            <Text style={s.emptyBody}>
              Sit tight — we'll notify you when a rider blasts your area.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BlastCard
            request={item}
            acting={acting === item.id}
            onHmu={() => handleHmu(item)}
            onPass={() => handlePass(item)}
          />
        )}
      />
    </View>
  );
}

function BlastCard({
  request, acting, onHmu, onPass,
}: {
  request: BlastRequest;
  acting: boolean;
  onHmu: () => void;
  onPass: () => void;
}) {
  const alreadyHmd = !!request._hmuAt;

  // Live countdown — recalculates every second
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const msLeft = Math.max(0, new Date(request.expiresAt).getTime() - now);
  const minsLeft = Math.floor(msLeft / 60000);
  const secsLeft = Math.floor((msLeft % 60000) / 1000);
  const isUrgent = minsLeft < 5;
  const isExpired = msLeft === 0;
  const timer = isExpired ? 'EXPIRED' : `${minsLeft}:${String(secsLeft).padStart(2, '0')}`;

  const pickup = request.pickupAddress || request.pickupAreaSlug || 'Pickup';
  const dropoff = request.destination || request.dropoffAreaSlug || 'Dropoff';

  return (
    <View style={[s.card, shadow.card]}>
      {/* ── Rider row ── */}
      <View style={s.riderRow}>
        <RiderAvatar url={request.riderAvatarUrl} name={request.riderHandle ?? request.riderName} />
        <View style={s.riderInfo}>
          <Text style={s.riderHandle} numberOfLines={1}>
            {request.riderHandle ? `@${request.riderHandle}` : request.riderName}
          </Text>
          {request.riderCompletedRides > 0 && (
            <Text style={s.riderMeta}>{request.riderCompletedRides} rides</Text>
          )}
        </View>
        <View style={[s.timerPill, isUrgent && s.timerPillUrgent, isExpired && s.timerPillExpired]}>
          {!isExpired && (
            <Ionicons
              name="time-outline"
              size={11}
              color={isUrgent ? colors.red : colors.textFaint}
              style={{ marginRight: 4 }}
            />
          )}
          <Text style={[s.timerText, isUrgent && s.timerTextUrgent, isExpired && s.timerTextExpired]}>
            {timer}
          </Text>
        </View>
      </View>

      {/* ── Route ── */}
      <View style={s.routeRow}>
        <Ionicons name="navigate-outline" size={13} color={colors.textFaint} style={{ marginRight: 4 }} />
        <Text style={s.area} numberOfLines={1}>{pickup} → {dropoff}</Text>
      </View>

      {/* ── Price ── */}
      <Text style={s.price}>${Number(request.price).toFixed(2)}</Text>

      {/* ── Meta chips ── */}
      <View style={s.metaRow}>
        {request.isCash && <MetaChip label="CASH" cash />}
        {request.time && <MetaChip label={request.time} />}
        {request.riderChillScore > 0 && (
          <MetaChip label={`${Math.round(request.riderChillScore)} chill`} accent />
        )}
      </View>

      {/* ── Actions ── */}
      <View style={s.actions}>
        {alreadyHmd ? (
          <View style={s.hmdConfirm}>
            <Ionicons name="checkmark-circle" size={16} color={colors.green} />
            <Text style={s.hmdConfirmText}>HMU Sent</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity style={s.passBtn} onPress={onPass} disabled={acting}>
              <Text style={s.passBtnText}>PASS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.hmuBtn, (acting || isExpired) && s.disabled]}
              onPress={onHmu}
              disabled={acting || isExpired}
            >
              {acting
                ? <ActivityIndicator size="small" color={colors.bg} />
                : <Text style={s.hmuBtnText}>HMU 🤙</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function RiderAvatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const letter = (name ?? '?')[0].toUpperCase();
  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={s.avatar}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[s.avatar, s.avatarFallback]}>
      <Text style={s.avatarLetter}>{letter}</Text>
    </View>
  );
}

function MetaChip({ label, accent, cash }: { label: string; accent?: boolean; cash?: boolean }) {
  return (
    <View style={[s.chip, accent && s.chipAccent, cash && s.chipCash]}>
      <Text style={[s.chipText, accent && s.chipTextAccent, cash && s.chipTextCash]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary },
  countBadge: { backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.bg },

  list: { paddingHorizontal: spacing.xl, paddingBottom: 48, gap: spacing.md },

  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: spacing.xxl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.lg },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 22 },

  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong },

  // Rider row: avatar + name/rides + timer
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: fonts.display, fontSize: 24, color: colors.green },
  riderInfo: { flex: 1 },
  riderHandle: { fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary, letterSpacing: 0.3 },
  riderMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },

  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  area: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, flex: 1 },

  timerPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  timerPillUrgent: { borderColor: colors.redBorder, backgroundColor: colors.redDim },
  timerPillExpired: { borderColor: colors.border, backgroundColor: colors.cardAlt },
  timerText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textFaint },
  timerTextUrgent: { color: colors.red },
  timerTextExpired: { color: colors.textFaint },

  price: { fontFamily: fonts.display, fontSize: 44, color: colors.green, lineHeight: 46, marginBottom: spacing.sm },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  chip: { backgroundColor: colors.cardAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  chipAccent: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipCash: { backgroundColor: colors.cashDim, borderColor: colors.cashBorder },
  chipText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary },
  chipTextAccent: { color: colors.green },
  chipTextCash: { color: colors.cash },

  actions: { flexDirection: 'row', gap: spacing.sm },
  passBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.cardAlt, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  passBtnText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, letterSpacing: 1 },
  hmuBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.green, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  hmuBtnText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.bg, letterSpacing: 0.5 },

  hmdConfirm: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.greenDim, borderRadius: radius.pill, paddingVertical: 14, borderWidth: 1, borderColor: colors.greenBorder },
  hmdConfirmText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, letterSpacing: 1 },
});
