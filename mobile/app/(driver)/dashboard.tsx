// Earnings dashboard — reuses the same /driver/earnings endpoint with a full breakdown view.
import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect } from 'expo-router';
import { useStableToken } from '@/hooks/use-stable-token';
import { apiClient } from '@/lib/api';

interface Earnings {
  today: { gross: number; fees: number; kept: number; rides: number; capHit: boolean; capUsed: number; capMax: number };
  week: { gross: number; fees: number; kept: number; rides: number; capHit: boolean; capUsed: number; capMax: number };
  tier: string;
}

export default function Dashboard() {
  const getToken = useStableToken();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await apiClient<Earnings>('/driver/earnings', token);
      setEarnings(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [getToken]);

  // Refetch on every focus so earnings reflect the latest completed ride
  // (not just the first mount).
  useFocusEffect(useCallback(() => { void fetch(); }, [fetch]));

  if (loading) return (
    <View style={styles.loader}><ActivityIndicator size="large" color="#00E676" /></View>
  );

  const feeRate = earnings?.tier === 'hmu_first' ? '12%' : '10–25%';
  const dailyCap = earnings?.tier === 'hmu_first' ? '$25' : '$40';
  const weeklyCap = earnings?.tier === 'hmu_first' ? '$100' : '$150';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetch(); }} tintColor="#00E676" />}
    >
      <Text style={styles.title}>Earnings</Text>

      <Row label="Today gross" value={`$${earnings?.today.gross.toFixed(2) ?? '0.00'}`} />
      <Row label="Today fees" value={`-$${earnings?.today.fees.toFixed(2) ?? '0.00'}`} accent="#FF4444" />
      <Row label="Today kept" value={`$${earnings?.today.kept.toFixed(2) ?? '0.00'}`} accent="#00E676" bold />
      <Row label="Today rides" value={String(earnings?.today.rides ?? 0)} />

      <View style={styles.divider} />

      <Row label="Week gross" value={`$${earnings?.week.gross.toFixed(2) ?? '0.00'}`} />
      <Row label="Week fees" value={`-$${earnings?.week.fees.toFixed(2) ?? '0.00'}`} accent="#FF4444" />
      <Row label="Week kept" value={`$${earnings?.week.kept.toFixed(2) ?? '0.00'}`} accent="#00E676" bold />
      <Row label="Week rides" value={String(earnings?.week.rides ?? 0)} />

      <View style={styles.divider} />

      <View style={styles.tierCard}>
        <Text style={styles.tierLabel}>
          {earnings?.tier === 'hmu_first' ? '⭐ HMU First' : 'Free Tier'}
        </Text>
        <Row label="Fee rate" value={feeRate} />
        <Row label="Daily fee cap" value={dailyCap} />
        <Row label="Weekly fee cap" value={weeklyCap} />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, accent, bold }: { label: string; value: string; accent?: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.bold, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  content: { padding: 16, paddingTop: 24, paddingBottom: 40 },
  loader: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#18181b' },
  rowLabel: { fontSize: 14, color: '#888' },
  rowValue: { fontSize: 14, color: '#fff', fontWeight: '600' },
  bold: { fontWeight: '800', fontSize: 16 },
  divider: { height: 1, backgroundColor: '#27272a', marginVertical: 16 },
  tierCard: { backgroundColor: '#18181b', borderRadius: 16, padding: 16, marginTop: 8 },
  tierLabel: { fontSize: 16, fontWeight: '800', color: '#FFB300', marginBottom: 12 },
});
