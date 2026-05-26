// Driver requests feed — incoming blast requests.
// APIs: GET /drivers/requests, POST /blast/{id}/hmu, POST /blast/{id}/pass
// Ably: user:{driverId}:notify → blast_invite triggers refetch

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useAbly } from '@/hooks/use-ably';

interface BlastRequest {
  id: string;
  post_type: 'blast';
  status: string;
  price: number;
  expires_at: string;
  created_at: string;
  pickup_area_slug: string | null;
  dropoff_area_slug: string | null;
  rider_name: string;
  rider_handle: string | null;
  time_window: string | null;
  distance_from_pickup_mi: number | null;
  match_score: number | null;
  targetId: string | null;
  hmu_at: string | null;
  passed_at: string | null;
}

export default function DriverFeed() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [requests, setRequests] = useState<BlastRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const driverId = user?.publicMetadata?.databaseId as string | undefined;

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

  useAbly({
    channelName: driverId ? `user:${driverId}:notify` : null,
    token,
    onMessage: (msg) => {
      if (msg.name === 'blast_invite' || msg.name === 'blast_cancelled') {
        void fetchRequests();
      }
    },
  });

  const onRefresh = useCallback(() => { setRefreshing(true); void fetchRequests(); }, [fetchRequests]);

  async function handleHmu(request: BlastRequest) {
    setActing(request.id);
    try {
      const t = await getToken();
      await apiClient(`/blast/${request.id}/hmu`, t, { method: 'POST' });
      setRequests((prev) => prev.map((r) => r.id === request.id ? { ...r, hmu_at: new Date().toISOString() } : r));
    } catch (e: any) {
      Alert.alert('Could not HMU', e.message ?? 'Try again');
    } finally {
      setActing(null);
    }
  }

  async function handlePass(request: BlastRequest) {
    setActing(request.id);
    try {
      const t = await getToken();
      await apiClient(`/blast/${request.id}/pass`, t, { method: 'POST' });
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch {
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const active = requests.filter((r) => !r.passed_at);

  return (
    <View style={s.root}>
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
  const alreadyHmd = !!request.hmu_at;
  const msLeft = new Date(request.expires_at).getTime() - Date.now();
  const minsLeft = Math.max(0, Math.floor(msLeft / 60000));
  const secsLeft = Math.max(0, Math.floor((msLeft % 60000) / 1000));
  const isUrgent = minsLeft < 5;
  const timer = `${minsLeft}:${String(secsLeft).padStart(2, '0')}`;

  return (
    <View style={[s.card, shadow.card]}>
      {/* Route row */}
      <View style={s.routeRow}>
        <View style={s.routeInfo}>
          <Ionicons name="navigate-outline" size={13} color={colors.textFaint} style={{ marginRight: 4 }} />
          <Text style={s.area} numberOfLines={1}>
            {request.pickup_area_slug ?? 'Pickup'} → {request.dropoff_area_slug ?? 'Dropoff'}
          </Text>
        </View>
        <View style={[s.timerPill, isUrgent && s.timerPillUrgent]}>
          <Text style={[s.timerText, isUrgent && s.timerTextUrgent]}>{timer}</Text>
        </View>
      </View>

      {/* Price */}
      <Text style={s.price}>${request.price}</Text>

      {/* Meta chips */}
      <View style={s.metaRow}>
        {request.rider_handle && (
          <MetaChip label={`@${request.rider_handle}`} />
        )}
        {request.distance_from_pickup_mi !== null && (
          <MetaChip label={`${request.distance_from_pickup_mi.toFixed(1)} mi`} />
        )}
        {request.time_window && (
          <MetaChip label={request.time_window} />
        )}
        {request.match_score !== null && (
          <MetaChip label={`${Math.round(request.match_score * 100)}% match`} accent />
        )}
      </View>

      {/* Actions */}
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
              style={[s.hmuBtn, acting && s.disabled]}
              onPress={onHmu}
              disabled={acting}
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

function MetaChip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View style={[s.chip, accent && s.chipAccent]}>
      <Text style={[s.chipText, accent && s.chipTextAccent]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.xl, paddingTop: spacing.xl + spacing.xs, gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary },
  countBadge: { backgroundColor: colors.green, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.bg },

  list: { paddingHorizontal: spacing.xl, paddingBottom: 48, gap: spacing.md },

  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: spacing.xxl },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.lg },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 22 },

  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong },

  routeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  routeInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.sm },
  area: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, flex: 1 },
  timerPill: { backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
  timerPillUrgent: { borderColor: colors.redBorder, backgroundColor: colors.redDim },
  timerText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textFaint },
  timerTextUrgent: { color: colors.red },

  price: { fontFamily: fonts.display, fontSize: 44, color: colors.green, lineHeight: 46, marginBottom: spacing.sm },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  chip: { backgroundColor: colors.cardAlt, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
  chipAccent: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary },
  chipTextAccent: { color: colors.green },

  actions: { flexDirection: 'row', gap: spacing.sm },
  passBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.cardAlt, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  passBtnText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, letterSpacing: 1 },
  hmuBtn: { flex: 2, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.green, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  hmuBtnText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.bg, letterSpacing: 0.5 },

  hmdConfirm: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.greenDim, borderRadius: radius.pill, paddingVertical: 14, borderWidth: 1, borderColor: colors.greenBorder },
  hmdConfirmText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, letterSpacing: 1 },
});
