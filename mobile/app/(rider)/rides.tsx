// Rider ride history — search + filter by day/week/month + date sections.

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Animated,
  TextInput, ScrollView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStableToken } from '@/hooks/use-stable-token';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ride {
  id: string;
  ref_code: string | null;
  status: string;
  amount: number;
  final_agreed_price: number | null;
  driver_rating: string | null;
  rider_rating: string | null;
  driver_name: string | null;
  driver_handle: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  is_cash: boolean;
  created_at: string;
  ended_at: string | null;
}

type ListItem =
  | { type: 'header'; label: string; key: string }
  | { type: 'ride'; ride: Ride; key: string };

type FilterKey = 'all' | 'today' | 'week' | 'month';

// ── Constants ─────────────────────────────────────────────────────────────────

const RATING_META: Record<string, { emoji: string; label: string; color: string; bg: string; border: string }> = {
  chill:        { emoji: '✅', label: 'CHILL',        color: colors.green, bg: colors.greenDim,  border: colors.greenBorder  },
  cool_af:      { emoji: '😎', label: 'COOL AF',      color: colors.blue,  bg: colors.blueDim,   border: colors.blueBorder   },
  kinda_creepy: { emoji: '👀', label: 'KINDA CREEPY', color: colors.amber, bg: colors.amberDim,  border: colors.amberBorder  },
  weirdo:       { emoji: '🚩', label: 'WEIRDO',       color: colors.red,   bg: colors.redDim,    border: colors.redBorder    },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  completed:   { label: 'DONE',      color: colors.green },
  ended:       { label: 'ENDED',     color: colors.amber },
  cancelled:   { label: 'CANCELLED', color: colors.textFaint },
  in_progress: { label: 'ACTIVE',    color: colors.blue },
  accepted:    { label: 'ACCEPTED',  color: colors.blue },
  requested:   { label: 'PENDING',   color: colors.amber },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',   label: 'ALL' },
  { key: 'today', label: 'TODAY' },
  { key: 'week',  label: 'THIS WEEK' },
  { key: 'month', label: 'THIS MONTH' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOf(unit: 'day' | 'week' | 'month'): Date {
  const d = new Date();
  if (unit === 'day')   { d.setHours(0, 0, 0, 0); return d; }
  if (unit === 'week')  { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; }
  d.setDate(1); d.setHours(0, 0, 0, 0); return d;
}

function dateSection(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(todayStart.getDate() - 1);
  const weekStart = new Date(todayStart); weekStart.setDate(todayStart.getDate() - 6);

  if (d >= todayStart)     return 'TODAY';
  if (d >= yesterdayStart) return 'YESTERDAY';
  if (d >= weekStart)      return 'THIS WEEK';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function matchesSearch(ride: Ride, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    (ride.dropoff_address ?? '').toLowerCase().includes(lower) ||
    (ride.pickup_address ?? '').toLowerCase().includes(lower) ||
    (ride.driver_handle ?? '').toLowerCase().includes(lower) ||
    (ride.driver_name ?? '').toLowerCase().includes(lower) ||
    (ride.ref_code ?? '').toLowerCase().includes(lower)
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RideRow({ ride, onPress, onRateNow }: { ride: Ride; onPress: () => void; onRateNow?: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, []);

  const price = ride.final_agreed_price ?? ride.amount;
  const statusMeta = STATUS_META[ride.status] ?? { label: ride.status.toUpperCase(), color: colors.textFaint };
  const ratingMeta = ride.driver_rating ? RATING_META[String(ride.driver_rating)] : null;
  const driverLabel = ride.driver_handle ? `@${ride.driver_handle}` : ride.driver_name ?? 'Unknown Driver';

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity style={[r.row, shadow.card]} onPress={onPress} activeOpacity={0.8}>
        <View style={r.top}>
          <Text style={r.destination} numberOfLines={1}>
            {ride.dropoff_address ?? 'Unknown destination'}
          </Text>
          <Text style={[r.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
        </View>

        <View style={r.meta}>
          <Text style={r.metaText} numberOfLines={1}>{driverLabel}</Text>
          <Text style={r.dot}>·</Text>
          <Text style={r.metaText}>{formatDate(ride.created_at)}</Text>
          <Text style={r.dot}>·</Text>
          <Text style={r.price}>{ride.is_cash ? '💵 ' : ''}${price.toFixed(2)}</Text>
        </View>

        <View style={r.pills}>
          {ratingMeta && (
            <View style={[r.pill, { backgroundColor: ratingMeta.bg, borderColor: ratingMeta.border }]}>
              <Text style={r.pillText}>{ratingMeta.emoji} </Text>
              <Text style={[r.pillText, { color: ratingMeta.color }]}>{ratingMeta.label}</Text>
            </View>
          )}
          {ride.status === 'ended' && ride.driver_rating == null && onRateNow && (
            <TouchableOpacity style={r.rateNowBtn} onPress={onRateNow} activeOpacity={0.8}>
              <Text style={r.rateNowText}>RATE DRIVER</Text>
              <Ionicons name="chevron-forward" size={11} color={colors.amber} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RiderRides() {
  const insets = useSafeAreaInsets();
  const getToken = useStableToken();
  const router = useRouter();
  const searchRef = useRef<TextInput>(null);

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchFocused, setSearchFocused] = useState(false);

  const fetchRides = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<{ rides: Ride[] }>('/rides/history', t);
      setRides(data.rides ?? []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [getToken]);

  useEffect(() => { void fetchRides(); }, [fetchRides]);

  const onRefresh = useCallback(() => { setRefreshing(true); void fetchRides(); }, [fetchRides]);

  // ── Filtered + grouped list data ──────────────────────────────────────────

  const listData = useMemo<ListItem[]>(() => {
    const q = query.trim();

    // Step 1: apply time filter (ignored when searching)
    let filtered = rides;
    if (!q && filter !== 'all') {
      const cutoff = startOf(filter === 'today' ? 'day' : filter === 'week' ? 'week' : 'month');
      filtered = rides.filter(r => new Date(r.created_at) >= cutoff);
    }

    // Step 2: apply search
    if (q) {
      filtered = rides.filter(r => matchesSearch(r, q));
    }

    // Step 3: build list items
    // Add section headers only in ALL mode with no search
    if (!q && filter === 'all') {
      const items: ListItem[] = [];
      let lastSection = '';
      for (const ride of filtered) {
        const section = dateSection(ride.created_at);
        if (section !== lastSection) {
          items.push({ type: 'header', label: section, key: `header-${section}` });
          lastSection = section;
        }
        items.push({ type: 'ride', ride, key: ride.id });
      }
      return items;
    }

    return filtered.map(ride => ({ type: 'ride' as const, ride, key: ride.id }));
  }, [rides, query, filter]);

  const rideCount = listData.filter(i => i.type === 'ride').length;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.title}>YOUR RIDES</Text>
        {!loading && (
          <View style={s.countBadge}>
            <Text style={s.countText}>{rideCount}</Text>
          </View>
        )}
      </View>

      {/* ── Search bar ── */}
      <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
        <Ionicons name="search-outline" size={16} color={searchFocused ? colors.green : colors.textFaint} />
        <TextInput
          ref={searchRef}
          style={s.searchInput}
          placeholder="Search by driver, address, or ref…"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chips}
        style={s.chipsRow}
      >
        {FILTERS.map(f => {
          const active = filter === f.key && !query;
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.chip, active && s.chipActive]}
              onPress={() => { setFilter(f.key); setQuery(''); }}
              activeOpacity={0.75}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── List ── */}
      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item.key}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <Text style={s.sectionHeader}>{item.label}</Text>;
            }
            return (
              <RideRow
                ride={item.ride}
                onPress={() => router.push(`/(rider)/ride/${item.ride.id}` as any)}
                onRateNow={() => router.push(`/(rider)/ride/${item.ride.id}` as any)}
              />
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons
                name={query ? 'search-outline' : 'car-outline'}
                size={36}
                color={colors.textFaint}
              />
              <Text style={s.emptyTitle}>
                {query ? 'No rides match' : 'No rides yet'}
              </Text>
              {query ? (
                <Text style={s.emptyBody}>Try a different driver name, address, or ref code.</Text>
              ) : filter !== 'all' ? (
                <Text style={s.emptyBody}>No rides in this period. Switch to ALL to see everything.</Text>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary },
  countBadge: {
    backgroundColor: colors.cardAlt, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.border,
  },
  countText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textFaint },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.xl, marginBottom: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 1, borderColor: colors.border,
  },
  searchWrapFocused: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  searchInput: {
    flex: 1, fontFamily: fonts.body, fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 0,
  },

  chipsRow: { flexGrow: 0, marginBottom: spacing.sm },
  chips: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  chip: {
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 0.8 },
  chipTextActive: { color: colors.green },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: spacing.md, paddingBottom: 80, gap: spacing.sm },

  sectionHeader: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint,
    letterSpacing: 2, paddingHorizontal: spacing.sm,
    paddingTop: spacing.lg, paddingBottom: spacing.xs,
  },

  empty: { alignItems: 'center', paddingTop: 72, gap: spacing.md, paddingHorizontal: spacing.xxl },
  emptyTitle: { fontFamily: fonts.mono, fontSize: 13, color: colors.textFaint, letterSpacing: 1 },
  emptyBody: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary,
    textAlign: 'center', lineHeight: 20,
  },
});

const r = StyleSheet.create({
  row: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong,
  },
  top: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 6,
  },
  destination: {
    fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary,
    flex: 1, marginRight: spacing.sm,
  },
  statusText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 10, flexWrap: 'wrap' },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  dot: { color: colors.textFaint, fontSize: 10 },
  price: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textSecondary },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
  },
  pillText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  rateNowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.amberBorder,
  },
  rateNowText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.amber, letterSpacing: 0.5 },
});
