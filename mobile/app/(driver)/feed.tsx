// Driver requests feed — incoming blast requests.
// APIs: GET /drivers/requests, POST /blast/{id}/hmu, POST /blast/{id}/pass
// Ably: user:{driverId}:notify → blast_invite triggers refetch

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
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

  // Keep token fresh for Ably
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

  // Ably: personal notify channel for this driver
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
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#00E676" />
      </View>
    );
  }

  const active = requests.filter((r) => !r.passed_at);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Requests</Text>
        <Text style={styles.count}>{active.length} available</Text>
      </View>

      <FlatList
        data={active}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00E676" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No requests right now</Text>
            <Text style={styles.emptyBody}>Sit tight — we'll notify you when a rider sends a blast to your area.</Text>
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
  const expiresIn = Math.max(0, Math.floor((new Date(request.expires_at).getTime() - Date.now()) / 60000));
  const isUrgent = expiresIn < 5;

  return (
    <View style={styles.card}>
      {/* Route */}
      <View style={styles.routeRow}>
        <Text style={styles.area} numberOfLines={1}>
          {request.pickup_area_slug ?? 'Pickup'} → {request.dropoff_area_slug ?? 'Dropoff'}
        </Text>
        <Text style={[styles.timer, isUrgent && styles.timerUrgent]}>
          {expiresIn}m left
        </Text>
      </View>

      {/* Price + meta */}
      <Text style={styles.price}>${request.price}</Text>
      <View style={styles.meta}>
        {request.distance_from_pickup_mi !== null && (
          <Text style={styles.metaItem}>{request.distance_from_pickup_mi.toFixed(1)} mi away</Text>
        )}
        {request.time_window && (
          <Text style={styles.metaItem}>{request.time_window}</Text>
        )}
        {request.match_score !== null && (
          <Text style={styles.metaItem}>
            <Text style={styles.matchScore}>{Math.round(request.match_score * 100)}%</Text> match
          </Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {alreadyHmd ? (
          <View style={styles.hmdBadge}>
            <Text style={styles.hmdBadgeText}>HMU Sent ✓</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={styles.passBtn}
              onPress={onPass}
              disabled={acting}
            >
              <Text style={styles.passBtnText}>Nah</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.hmuBtn, acting && styles.hmuBtnDisabled]}
              onPress={onHmu}
              disabled={acting}
            >
              {acting
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={styles.hmuBtnText}>HMU 🤙</Text>
              }
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  loader: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#fff' },
  count: { fontSize: 13, color: '#555', fontWeight: '600' },
  list: { padding: 12, gap: 12, paddingBottom: 40 },
  empty: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: '#18181b', borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: '#27272a',
  },
  routeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  area: { fontSize: 13, color: '#888', flex: 1, marginRight: 8 },
  timer: { fontSize: 12, color: '#555', fontWeight: '600' },
  timerUrgent: { color: '#FF4444' },
  price: { fontSize: 32, fontWeight: '900', color: '#fff', marginBottom: 8 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  metaItem: { fontSize: 12, color: '#555' },
  matchScore: { color: '#00E676', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  passBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#27272a', alignItems: 'center',
  },
  passBtnText: { color: '#888', fontWeight: '600', fontSize: 15 },
  hmuBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#00E676', alignItems: 'center',
  },
  hmuBtnDisabled: { opacity: 0.5 },
  hmuBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
  hmdBadge: {
    flex: 1, paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#00E676/10', alignItems: 'center',
    borderWidth: 1, borderColor: '#00E676/30',
  },
  hmdBadgeText: { color: '#00E676', fontWeight: '700', fontSize: 14 },
});
