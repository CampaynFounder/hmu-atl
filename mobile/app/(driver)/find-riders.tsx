// Find Riders — TikTok-style vertical snap feed of rider profiles in driver's market.
// GET /api/driver/find-riders/list?offset=N&limit=30 → { riders, hasMore }
// POST /api/driver/hmu { riderId, message? } → send HMU
//
// Architecture: load pages of 30, client-side filter by search/area so the
// feed feels instant. Each card snaps to fill the visible viewport.

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Image, ActivityIndicator, Pressable, Animated, Dimensions,
  ScrollView, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PAGE_SIZE = 30;

interface MaskedRider {
  id: string;
  handle: string;
  firstName: string;
  lastName: string;
  homeAreas: string[];
  avatarUrl: string | null;
  gender: string | null;
  driverPreference: string | null;
  lgbtqFriendly: boolean;
  completedRides: number;
}

interface HmuState {
  [riderId: string]: 'idle' | 'sending' | 'sent' | 'error';
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function FindRidersScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [riders, setRiders] = useState<MaskedRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hmuState, setHmuState] = useState<HmuState>({});
  const [search, setSearch] = useState('');
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const offsetRef = useRef(0);

  // Card height measured from the FlatList container via onLayout so that
  // pagingEnabled snap always aligns perfectly regardless of search bar state.
  const NAVBAR_H = 52 + insets.top;
  const [listHeight, setListHeight] = useState(
    SCREEN_H - NAVBAR_H - insets.bottom,
  );
  const CARD_H = listHeight;

  async function loadPage(reset = false) {
    const offset = reset ? 0 : offsetRef.current;
    if (!reset && !hasMore) return;
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const t = await getToken();
      const data = await apiClient<{ riders: MaskedRider[]; hasMore: boolean }>(
        `/driver/find-riders/list?offset=${offset}&limit=${PAGE_SIZE}`, t,
      );
      if (reset) {
        setRiders(data.riders);
      } else {
        setRiders((prev) => {
          const ids = new Set(prev.map((r) => r.id));
          return [...prev, ...data.riders.filter((r) => !ids.has(r.id))];
        });
      }
      offsetRef.current = offset + data.riders.length;
      setHasMore(data.hasMore);
    } catch {}
    finally { setLoading(false); setLoadingMore(false); }
  }

  useEffect(() => { void loadPage(true); }, []);

  // Unique areas from all loaded riders for the filter chips
  const allAreas = useMemo(() => {
    const set = new Set<string>();
    riders.forEach((r) => r.homeAreas.forEach((a) => set.add(a)));
    return Array.from(set).sort();
  }, [riders]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return riders.filter((r) => {
      const matchSearch = !q ||
        r.handle.toLowerCase().includes(q) ||
        r.firstName.toLowerCase().includes(q);
      const matchArea = !activeArea || r.homeAreas.includes(activeArea);
      return matchSearch && matchArea;
    });
  }, [riders, search, activeArea]);

  async function sendHmu(rider: MaskedRider) {
    if (hmuState[rider.id] === 'sent' || hmuState[rider.id] === 'sending') return;
    setHmuState((s) => ({ ...s, [rider.id]: 'sending' }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const t = await getToken();
      await apiClient('/driver/hmu', t, {
        method: 'POST',
        body: JSON.stringify({ riderId: rider.id }),
      });
      setHmuState((s) => ({ ...s, [rider.id]: 'sent' }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setHmuState((s) => ({ ...s, [rider.id]: 'error' }));
      setTimeout(() => setHmuState((s) => ({ ...s, [rider.id]: 'idle' })), 2500);
    }
  }

  function toggleSearch() {
    setSearchVisible((v) => {
      if (!v) setTimeout(() => searchRef.current?.focus(), 120);
      return !v;
    });
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
        <Text style={s.loadingText}>Finding riders in your market…</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Navbar */}
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.navCenter}>
          <Text style={s.navTitle}>FIND RIDERS</Text>
          {filtered.length > 0 && (
            <Text style={s.navCount}>{filtered.length} in market</Text>
          )}
        </View>
        <TouchableOpacity onPress={toggleSearch} style={[s.backBtn, searchVisible && s.backBtnActive]} activeOpacity={0.7}>
          <Ionicons name={searchVisible ? 'close' : 'search'} size={18} color={searchVisible ? colors.green : colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      {searchVisible && (
        <View style={s.searchWrap}>
          <Ionicons name="search" size={15} color={colors.textFaint} style={s.searchIcon} />
          <TextInput
            ref={searchRef}
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by handle or name…"
            placeholderTextColor={colors.textFaint}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      )}

      {/* Area filter chips */}
      {allAreas.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.areaChips}
        >
          <Pressable
            style={[s.areaChip, !activeArea && s.areaChipActive]}
            onPress={() => setActiveArea(null)}
          >
            <Text style={[s.areaChipText, !activeArea && s.areaChipTextActive]}>ALL</Text>
          </Pressable>
          {allAreas.map((area) => (
            <Pressable
              key={area}
              style={[s.areaChip, activeArea === area && s.areaChipActive]}
              onPress={() => setActiveArea(activeArea === area ? null : area)}
            >
              <Text style={[s.areaChipText, activeArea === area && s.areaChipTextActive]}>
                {area.toUpperCase().replace(/-/g, ' ')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Feed */}
      {filtered.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No riders found</Text>
          <Text style={s.emptySub}>
            {search || activeArea ? 'Try a different filter' : 'Check back when more riders join your market'}
          </Text>
        </View>
      ) : (
        <View
          style={{ flex: 1 }}
          onLayout={e => setListHeight(e.nativeEvent.layout.height)}
        >
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            decelerationRate="fast"
            snapToAlignment="start"
            getItemLayout={(_, i) => ({ length: CARD_H, offset: CARD_H * i, index: i })}
            renderItem={({ item }) => (
              <RiderCard
                rider={item}
                cardHeight={CARD_H}
                hmuStatus={hmuState[item.id] ?? 'idle'}
                onHmu={() => sendHmu(item)}
              />
            )}
            onEndReached={() => { if (!loadingMore) void loadPage(); }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loadingMore ? (
              <View style={{ height: CARD_H, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={colors.green} />
              </View>
            ) : null}
          />
        </View>
      )}
    </View>
  );
}

// ── RiderCard ─────────────────────────────────────────────────────────────────

function RiderCard({
  rider, cardHeight, hmuStatus, onHmu,
}: {
  rider: MaskedRider;
  cardHeight: number;
  hmuStatus: 'idle' | 'sending' | 'sent' | 'error';
  onHmu: () => void;
}) {
  const initials = [rider.firstName[0], rider.lastName[0]].filter(Boolean).join('').toUpperCase() || rider.handle[0]?.toUpperCase() || '?';
  const sent = hmuStatus === 'sent';
  const sending = hmuStatus === 'sending';
  const errored = hmuStatus === 'error';

  const btnScale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 5 }).start();

  return (
    <View style={[c.card, { height: cardHeight }]}>
      {/* Avatar / initials */}
      <View style={c.avatarWrap}>
        {rider.avatarUrl ? (
          <Image source={{ uri: rider.avatarUrl }} style={c.avatar} />
        ) : (
          <View style={c.initialsCircle}>
            <Text style={c.initials}>{initials}</Text>
          </View>
        )}
      </View>

      {/* Identity */}
      <View style={c.identity}>
        <Text style={c.handle}>@{rider.handle}</Text>
        <Text style={c.name}>{rider.firstName} {rider.lastName[0] ? `${rider.lastName[0]}.` : ''}</Text>
      </View>

      {/* Badges */}
      <View style={c.badges}>
        {rider.completedRides > 0 && (
          <View style={c.badge}>
            <Ionicons name="car" size={11} color={colors.green} />
            <Text style={c.badgeText}>{rider.completedRides} ride{rider.completedRides !== 1 ? 's' : ''}</Text>
          </View>
        )}
        {rider.lgbtqFriendly && (
          <View style={[c.badge, c.badgePride]}>
            <Text style={c.badgeText}>🏳️‍🌈 LGBTQ+</Text>
          </View>
        )}
        {rider.driverPreference && rider.driverPreference !== 'no_preference' && rider.driverPreference !== 'any' && (
          <View style={[c.badge, c.badgePref]}>
            <Ionicons name="person" size={11} color={colors.blue} />
            <Text style={[c.badgeText, { color: colors.blue }]}>
              {rider.driverPreference.replace(/_/g, ' ')}
            </Text>
          </View>
        )}
      </View>

      {/* Home areas */}
      {rider.homeAreas.length > 0 && (
        <View style={c.areasRow}>
          <Ionicons name="location" size={12} color={colors.textFaint} />
          <Text style={c.areasText} numberOfLines={1}>
            {rider.homeAreas.map((a) => a.replace(/-/g, ' ')).join(' · ')}
          </Text>
        </View>
      )}

      {/* CTA */}
      <View style={c.cta}>
        <Pressable onPress={onHmu} onPressIn={pressIn} onPressOut={pressOut} disabled={sent || sending} style={c.hmuBtnWrap}>
          <Animated.View style={[
            c.hmuBtn,
            sent && c.hmuBtnSent,
            errored && c.hmuBtnError,
            { transform: [{ scale: btnScale }] },
          ]}>
            {sending ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : sent ? (
              <>
                <Ionicons name="checkmark" size={16} color={colors.bg} />
                <Text style={c.hmuBtnText}>HMU SENT</Text>
              </>
            ) : errored ? (
              <Text style={[c.hmuBtnText, { color: colors.bg }]}>TRY AGAIN</Text>
            ) : (
              <>
                <Text style={c.hmuBtnText}>HMU</Text>
                <Ionicons name="paper-plane" size={14} color={colors.bg} />
              </>
            )}
          </Animated.View>
        </Pressable>
        <View style={c.swipeHintRow}>
          <Ionicons name="chevron-up" size={12} color={colors.textFaint} />
          <Text style={c.swipeHint}>NEXT RIDER</Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },

  navbar: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  backBtnActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  navCenter: { alignItems: 'center' },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },
  navCount: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    height: 48, paddingHorizontal: spacing.lg, gap: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary,
    paddingVertical: 0,
  },

  areaChips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
  areaChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  areaChipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  areaChipText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },
  areaChipTextActive: { color: colors.green },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary },
  emptySub: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint, textAlign: 'center', lineHeight: 22 },
});

const c = StyleSheet.create({
  card: {
    width: SCREEN_W,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    // Top accent line signals "swipe up for next card"
    borderTopWidth: 3,
    borderTopColor: colors.greenBorder,
    // Subtle bottom separator
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },

  avatarWrap: { marginBottom: spacing.xl },
  avatar: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 2, borderColor: colors.greenBorder,
  },
  initialsCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.border,
  },
  initials: { fontFamily: fonts.display, fontSize: 48, color: colors.textSecondary },

  identity: { alignItems: 'center', marginBottom: spacing.lg },
  handle: { fontFamily: fonts.display, fontSize: 32, color: colors.textPrimary, lineHeight: 36 },
  name: { fontFamily: fonts.body, fontSize: 15, color: colors.textTertiary, marginTop: 2 },

  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center', marginBottom: spacing.md },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.greenDim, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.greenBorder,
  },
  badgePride: { backgroundColor: 'rgba(255,64,129,0.06)', borderColor: 'rgba(255,64,129,0.18)' },
  badgePref: { backgroundColor: colors.blueDim, borderColor: colors.blueBorder },
  badgeText: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 0.5 },

  areasRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.xxxl },
  areasText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, flex: 1, textAlign: 'center' },

  cta: { width: '100%', alignItems: 'center', gap: spacing.sm },
  hmuBtnWrap: { width: '80%' },
  hmuBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 16, width: '100%', gap: 6,
    ...shadow.glow,
  },
  hmuBtnSent: { backgroundColor: colors.textFaint, shadowOpacity: 0 },
  hmuBtnError: { backgroundColor: colors.red, shadowColor: colors.red },
  hmuBtnText: { fontFamily: fonts.mono, fontSize: 14, color: colors.bg },
  swipeHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, opacity: 0.6 },
  swipeHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
});
