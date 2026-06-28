// Rider driver browse — TikTok-style vertical snap feed.
// GET /api/rider/browse/list?offset=N&limit=20&lat=X&lng=Y
// HMU button pre-fills the Direct Booking form with the driver's handle.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, TextInput,
  Dimensions, Pressable, ScrollView, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import Animated, {
  FadeIn, useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { HmuImage } from '@/components/HmuImage';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const TAB_BAR_H = 64;
const SEARCH_H = 52;
const PAGE_SIZE = 20;

// Grid (thumbnail) view metrics — 2 columns so riders can scan every driver in
// their market at a glance.
const GRID_PAD = spacing.lg;
const GRID_GAP = spacing.md;
const GRID_CARD_W = (SCREEN_W - GRID_PAD * 2 - GRID_GAP) / 2;
const GRID_CARD_H = GRID_CARD_W * 1.2;

interface DriverCard {
  handle: string;
  displayName: string;
  areas: string[];
  minPrice: number;
  videoUrl: string | null;
  photoUrl: string | null;
  lgbtqFriendly: boolean;
  chillScore: number;
  isHmuFirst: boolean;
  enforceMinimum: boolean;
  fwu: boolean;
  acceptsCash: boolean;
  cashOnly: boolean;
  liveMessage: string | null;
  livePrice: number | null;
  serviceIcons: string[];
  vehicleSummary: { label: string; maxRiders: number | null } | null;
  acceptsDownBad: boolean;
  acceptanceRate: number | null;
  distanceMi: number | null;
  locationSource: 'live' | 'home' | 'pinned' | null;
}

const ACC_FILTER_OPTIONS = [
  { label: 'ANY', value: 0 },
  { label: '75%+', value: 75 },
  { label: '90%+', value: 90 },
] as const;

type AccFilter = 0 | 75 | 90;

function accColor(rate: number): string {
  if (rate >= 90) return colors.green;
  if (rate >= 75) return colors.amber;
  if (rate >= 50) return colors.textTertiary;
  return colors.red;
}

// ── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, color, dimColor, borderColor }: {
  label: string; color: string; dimColor: string; borderColor: string;
}) {
  return (
    <View style={[chip.wrap, { backgroundColor: dimColor, borderColor }]}>
      <Text style={[chip.text, { color }]}>{label}</Text>
    </View>
  );
}

const chip = StyleSheet.create({
  wrap: {
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1,
  },
  text: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 },
});

// ── Driver card ───────────────────────────────────────────────────────────────

function DriverCardView({ driver, cardH, canDirect, canDownBad, onHmu, onDownBad }: {
  driver: DriverCard;
  cardH: number;
  canDirect: boolean;
  canDownBad: boolean;
  onHmu: (handle: string) => void;
  onDownBad: (handle: string) => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const mediaUri = driver.photoUrl ?? null;
  const hasVideo = !!driver.videoUrl;
  const initials = (driver.displayName || driver.handle).slice(0, 2).toUpperCase();

  const displayPrice = driver.livePrice ?? driver.minPrice;

  const chips: { label: string; color: string; dim: string; border: string }[] = [];
  if (driver.isHmuFirst) chips.push({ label: 'HMU 1ST', color: colors.cash, dim: colors.cashDim, border: colors.cashBorder });
  if (driver.fwu) chips.push({ label: 'FWU', color: colors.pink, dim: colors.pinkDim, border: colors.pinkBorder });
  if (driver.lgbtqFriendly) chips.push({ label: 'LGBTQ+', color: colors.blue, dim: colors.blueDim, border: colors.blueBorder });
  if (driver.cashOnly) chips.push({ label: 'CASH ONLY', color: colors.amber, dim: colors.amberDim, border: colors.amberBorder });
  else if (driver.acceptsCash) chips.push({ label: 'CASH OK', color: colors.green, dim: colors.greenDim, border: colors.greenBorder });
  if (driver.acceptsDownBad) chips.push({ label: 'DOWN BAD', color: colors.amber, dim: colors.amberDim, border: colors.amberBorder });

  const visibleChips = chips.slice(0, 3);
  const overflow = chips.length - visibleChips.length;

  return (
    <View style={[s.card, { height: cardH, width: SCREEN_W }]}>
      {/* Full-bleed media — native Image required; expo-image breaks absoluteFill in paging FlatList */}
      {mediaUri ? (
        <Image source={{ uri: mediaUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.fallbackBg]}>
          <Text style={s.fallbackInitials}>{initials}</Text>
        </View>
      )}

      {/* Video badge */}
      {hasVideo && (
        <TouchableOpacity
          style={s.playBtn}
          onPress={() => driver.videoUrl && Linking.openURL(driver.videoUrl)}
          activeOpacity={0.8}
        >
          <View style={s.playIcon}>
            <Ionicons name="play" size={18} color={colors.textPrimary} />
          </View>
        </TouchableOpacity>
      )}

      {/* Live indicator */}
      {driver.liveMessage && (
        <Animated.View entering={FadeIn.duration(400)} style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveText} numberOfLines={1}>{driver.liveMessage}</Text>
        </Animated.View>
      )}

      {/* Dark scrim + info panel */}
      <View style={s.scrim} />
      <View style={s.infoPanel}>
        {/* Top row: name + price */}
        <View style={s.nameRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.displayName} numberOfLines={1}>
              {driver.displayName || `@${driver.handle}`}
            </Text>
            <Text style={s.handle}>@{driver.handle}</Text>
          </View>
          <View style={s.priceWrap}>
            <Text style={s.priceDollar}>$</Text>
            <Text style={s.priceValue}>{displayPrice}</Text>
            <Text style={s.priceLabel}>/ride</Text>
          </View>
        </View>

        {/* Areas */}
        {driver.areas.length > 0 && (
          <View style={s.areasRow}>
            <Ionicons name="location-outline" size={11} color={colors.textFaint} />
            <Text style={s.areasText} numberOfLines={1}>
              {driver.areas.slice(0, 3).join(' · ')}
            </Text>
          </View>
        )}

        {/* Stats row */}
        <View style={s.statsRow}>
          {driver.chillScore > 0 && (
            <View style={s.stat}>
              <Ionicons name="star" size={11} color={colors.green} />
              <Text style={s.statText}>{driver.chillScore}%</Text>
            </View>
          )}
          {driver.acceptanceRate != null && (
            <View style={s.stat}>
              <Ionicons name="checkmark-circle" size={11} color={accColor(driver.acceptanceRate)} />
              <Text style={[s.statText, { color: accColor(driver.acceptanceRate) }]}>
                {driver.acceptanceRate}%
              </Text>
            </View>
          )}
          {driver.distanceMi != null && (
            <View style={s.stat}>
              <Ionicons
                name={driver.locationSource === 'live' ? 'navigate' : 'location-outline'}
                size={11}
                color={driver.locationSource === 'live' ? colors.green : colors.textFaint}
              />
              <Text style={s.statText}>{driver.distanceMi.toFixed(1)} mi</Text>
            </View>
          )}
          {driver.vehicleSummary && (
            <View style={s.stat}>
              <Ionicons name="car-outline" size={11} color={colors.textFaint} />
              <Text style={s.statText}>
                {driver.vehicleSummary.label}
                {driver.vehicleSummary.maxRiders ? ` · ${driver.vehicleSummary.maxRiders}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Chips */}
        {visibleChips.length > 0 && (
          <View style={s.chipsRow}>
            {visibleChips.map(c => (
              <Chip key={c.label} label={c.label} color={c.color} dimColor={c.dim} borderColor={c.border} />
            ))}
            {overflow > 0 && (
              <View style={[chip.wrap, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Text style={[chip.text, { color: colors.textFaint }]}>+{overflow}</Text>
              </View>
            )}
          </View>
        )}

        {/* HMU button — Direct booking entry. Hidden when Direct is OFF for
            this market so Browse can't bypass the home gate. */}
        {canDirect ? (
          <Animated.View style={animStyle}>
            <Pressable
              style={s.hmuBtn}
              onPressIn={() => { scale.value = withSpring(0.97, { damping: 20 }); }}
              onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
              onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onHmu(driver.handle); }}
            >
              <Text style={s.hmuBtnText}>HMU @{driver.handle} →</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <View style={s.comingSoonBtn}>
            <Text style={s.comingSoonBtnText}>DIRECT BOOKING — COMING SOON</Text>
          </View>
        )}

        {driver.acceptsDownBad && canDownBad && (
          <TouchableOpacity
            style={s.downBadLink}
            activeOpacity={0.7}
            onPress={() => onDownBad(driver.handle)}
          >
            <Text style={s.downBadText}>Make a Down Bad offer ↓</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Grid (thumbnail) card ──────────────────────────────────────────────────────
// Compact card for the at-a-glance market view. Tapping it starts the same HMU
// flow as the feed's HMU button (Direct booking, prefilled handle) when Direct
// is enabled; otherwise it stays a view-only thumbnail.

function GridCard({ driver, width, height, canDirect, onHmu }: {
  driver: DriverCard;
  width: number;
  height: number;
  canDirect: boolean;
  onHmu: (handle: string) => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const initials = (driver.displayName || driver.handle).slice(0, 2).toUpperCase();
  const displayPrice = driver.livePrice ?? driver.minPrice;

  return (
    <Animated.View style={[animStyle, { width }]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 20 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
        onPress={() => {
          if (!canDirect) return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onHmu(driver.handle);
        }}
        style={[g.card, { width, height }]}
      >
        <HmuImage
          uri={driver.photoUrl ?? undefined}
          style={StyleSheet.absoluteFill}
          fallbackInitials={initials}
          fallbackBg={colors.cardAlt}
        />

        {/* Badges */}
        {!!driver.videoUrl && (
          <View style={g.playBadge}>
            <Ionicons name="play" size={10} color={colors.textPrimary} />
          </View>
        )}
        {/* Live takes the top-left corner; HMU 1ST only shows when not live so
            the two never overlap. */}
        {driver.liveMessage ? (
          <View style={g.liveDot} />
        ) : driver.isHmuFirst ? (
          <View style={g.firstBadge}>
            <Text style={g.firstBadgeText}>HMU 1ST</Text>
          </View>
        ) : null}

        {/* Bottom scrim + info */}
        <View style={g.scrim} />
        <View style={g.info}>
          <Text style={g.name} numberOfLines={1}>
            {driver.displayName || `@${driver.handle}`}
          </Text>
          <View style={g.metaRow}>
            <Text style={g.price}>${displayPrice}</Text>
            {driver.chillScore > 0 && (
              <View style={g.stat}>
                <Ionicons name="star" size={9} color={colors.green} />
                <Text style={g.statText}>{driver.chillScore}%</Text>
              </View>
            )}
            {driver.distanceMi != null && (
              <View style={g.stat}>
                <Ionicons
                  name={driver.locationSource === 'live' ? 'navigate' : 'location-outline'}
                  size={9}
                  color={driver.locationSource === 'live' ? colors.green : colors.textFaint}
                />
                <Text style={g.statText}>{driver.distanceMi.toFixed(1)}mi</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function BrowseDrivers() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  // Use onLayout to measure the FlatList's actual available height.
  // Static subtraction misses the topBar and filter chrome, causing items to
  // be taller than the scroll window which breaks pagingEnabled snap.
  const [listHeight, setListHeight] = useState(
    SCREEN_H - insets.top - TAB_BAR_H - SEARCH_H - spacing.sm * 2,
  );
  const CARD_H = listHeight;

  const [drivers, setDrivers] = useState<DriverCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Feed = TikTok-style snap; Grid = thumbnail overview of every driver in the
  // market. Default Feed so the signature experience is unchanged.
  const [view, setView] = useState<'feed' | 'grid'>('feed');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<'any' | 'woman' | 'man'>('any');
  const [accFilter, setAccFilter] = useState<AccFilter>(0);
  // 'recommended' = curated ranking; 'closest' = nearest-first by distance.
  const [sortBy, setSortBy] = useState<'recommended' | 'closest'>('recommended');

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Per-market booking-type availability — defaults on so there's no flicker
  // before the fetch resolves. Gates the HMU (Direct) + Down Bad entry points.
  const [canDirect, setCanDirect] = useState(true);
  const [canDownBad, setCanDownBad] = useState(true);
  const hasLoaded = useRef(false);
  const offsetRef = useRef(0);

  // Unique areas from loaded drivers for filter chips
  const allAreas = useMemo(() => {
    const set = new Set<string>();
    drivers.forEach(d => d.areas.forEach(a => set.add(a)));
    return Array.from(set).sort();
  }, [drivers]);

  // Client-side filter by search query
  const filtered = useMemo(() => {
    let list = drivers;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(d =>
        d.handle.toLowerCase().includes(q) ||
        d.displayName.toLowerCase().includes(q),
      );
    }
    if (areaFilter) {
      list = list.filter(d => d.areas.includes(areaFilter));
    }
    // Acceptance rate filter — client-side since scalar subquery doesn't
    // support a WHERE clause reference to the computed alias
    if (accFilter > 0) {
      list = list.filter(d => d.acceptanceRate == null || d.acceptanceRate >= accFilter);
    }
    return list;
  }, [drivers, query, areaFilter, accFilter]);

  const buildUrl = useCallback((offset: number) => {
    let url = `/rider/browse/list?offset=${offset}&limit=${PAGE_SIZE}`;
    if (coords) url += `&lat=${coords.lat}&lng=${coords.lng}`;
    if (genderFilter !== 'any') url += `&gender=${genderFilter === 'woman' ? 'female' : 'male'}`;
    if (accFilter > 0) url += `&minAcceptanceRate=${accFilter}`;
    // Closest-first only resolves server-side when we have rider coords; the
    // backend falls back to recommended otherwise, so it's safe to always send.
    if (sortBy === 'closest' && coords) url += `&sort=distance`;
    return url;
  }, [coords, genderFilter, accFilter, sortBy]);

  const load = useCallback(async (reset = false) => {
    if (reset) {
      if (!hasLoaded.current) setLoading(true);
      offsetRef.current = 0;
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const t = await getToken();
      const data = await apiClient<{ drivers: DriverCard[]; hasMore: boolean }>(
        buildUrl(offsetRef.current), t,
      );
      const incoming = data.drivers ?? [];
      setDrivers(prev => {
        if (reset) return incoming;
        const ids = new Set(prev.map(d => d.handle));
        return [...prev, ...incoming.filter(d => !ids.has(d.handle))];
      });
      setHasMore(data.hasMore);
      offsetRef.current += incoming.length;
    } catch (e: any) {
      setError(e.message ?? 'Could not load drivers');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      hasLoaded.current = true;
    }
  }, [getToken, buildUrl]);

  // Fetch booking-type availability once — gates Direct/Down Bad entry points.
  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        const a = await apiClient<{ direct: boolean; downBad: boolean }>('/rider/booking-availability', t);
        setCanDirect(a.direct);
        setCanDownBad(a.downBad);
      } catch { /* leave defaults on */ }
    })();
  }, [getToken]);

  // Get GPS on mount (non-blocking) — refetch with distance when available
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
        .catch(() => {});
    }).catch(() => {});
  }, []);

  // Refetch when coords, gender filter, acceptance rate, or sort order changes
  useEffect(() => {
    if (hasLoaded.current) void load(true);
  }, [coords, genderFilter, accFilter, sortBy]);

  // Load on first focus only
  useFocusEffect(useCallback(() => {
    if (!hasLoaded.current) void load(true);
  }, [load]));

  function handleHmu(handle: string) {
    router.push({
      pathname: '/(rider)/book/direct',
      params: { prefillHandle: handle },
    } as never);
  }

  const renderItem = useCallback(({ item }: { item: DriverCard }) => (
    <DriverCardView
      driver={item}
      cardH={CARD_H}
      canDirect={canDirect}
      canDownBad={canDownBad}
      onHmu={handleHmu}
      onDownBad={(handle) => router.push({
        pathname: '/(rider)/book/down-bad',
        params: { prefillHandle: handle },
      } as never)}
    />
  ), [CARD_H, canDirect, canDownBad]);

  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: CARD_H, offset: CARD_H * index, index,
  }), [CARD_H]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore && !loading) void load(false);
  }, [loadingMore, hasMore, loading, load]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Search / filter bar */}
      <View style={s.topBar}>
        {searchOpen ? (
          <View style={s.searchRow}>
            <View style={s.searchInput}>
              <Ionicons name="search-outline" size={14} color={colors.textFaint} style={{ marginLeft: spacing.md }} />
              <TextInput
                style={s.searchText}
                placeholder="Search drivers..."
                placeholderTextColor={colors.textFaint}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity
              style={s.closeBtn}
              onPress={() => { setSearchOpen(false); setQuery(''); setAreaFilter(null); }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.topRow}>
            <Text style={s.topTitle}>BROWSE DRIVERS</Text>
            <View style={s.topActions}>
              <TouchableOpacity
                style={s.iconBtn}
                onPress={() => { setView(v => (v === 'feed' ? 'grid' : 'feed')); void Haptics.selectionAsync(); }}
              >
                <Ionicons
                  name={view === 'feed' ? 'grid-outline' : 'square-outline'}
                  size={18}
                  color={view === 'grid' ? colors.green : colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn} onPress={() => setSearchOpen(true)}>
                <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn} onPress={() => void load(true)}>
                <Ionicons name="refresh-outline" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Gender + area filters */}
      {searchOpen && (
        <Animated.View entering={FadeIn.duration(200)} style={s.filtersWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
            {/* Sort order — BEST (curated) vs CLOSEST (nearest first). CLOSEST
                needs GPS, so it's disabled until we have the rider's coords. */}
            <TouchableOpacity
              style={[s.filterChip, sortBy === 'recommended' && s.filterChipActive]}
              onPress={() => { setSortBy('recommended'); void Haptics.selectionAsync(); }}
            >
              <Text style={[s.filterChipText, sortBy === 'recommended' && s.filterChipTextActive]}>BEST</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.filterChip, sortBy === 'closest' && s.filterChipActive, !coords && { opacity: 0.4 }]}
              disabled={!coords}
              onPress={() => { setSortBy('closest'); void Haptics.selectionAsync(); }}
            >
              <Ionicons
                name="navigate-outline"
                size={10}
                color={sortBy === 'closest' ? colors.green : colors.textFaint}
                style={{ marginRight: 2 }}
              />
              <Text style={[s.filterChipText, sortBy === 'closest' && s.filterChipTextActive]}>CLOSEST</Text>
            </TouchableOpacity>
            <View style={s.filterSep} />
            {/* Acceptance rate filter */}
            {ACC_FILTER_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.value}
                style={[s.filterChip, accFilter === o.value && s.filterChipAccActive]}
                onPress={() => { setAccFilter(o.value as AccFilter); void Haptics.selectionAsync(); }}
              >
                {o.value > 0 && <Ionicons name="checkmark-circle-outline" size={10} color={accFilter === o.value ? colors.amber : colors.textFaint} style={{ marginRight: 2 }} />}
                <Text style={[s.filterChipText, accFilter === o.value && s.filterChipAccTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={s.filterSep} />
            {/* Gender filter */}
            {(['any', 'woman', 'man'] as const).map(g => (
              <TouchableOpacity
                key={g}
                style={[s.filterChip, genderFilter === g && s.filterChipActive]}
                onPress={() => { setGenderFilter(g); void Haptics.selectionAsync(); }}
              >
                <Text style={[s.filterChipText, genderFilter === g && s.filterChipTextActive]}>
                  {g === 'any' ? 'ANY' : g === 'woman' ? 'WOMEN' : 'MEN'}
                </Text>
              </TouchableOpacity>
            ))}
            {allAreas.length > 0 && <View style={s.filterSep} />}
            {/* Area filter */}
            {allAreas.map(area => (
              <TouchableOpacity
                key={area}
                style={[s.filterChip, areaFilter === area && s.filterChipActive]}
                onPress={() => { setAreaFilter(prev => prev === area ? null : area); void Haptics.selectionAsync(); }}
              >
                <Text style={[s.filterChipText, areaFilter === area && s.filterChipTextActive]}>{area.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* Feed */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.green} />
          <Text style={s.loadingText}>FINDING DRIVERS</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.textFaint} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => void load(true)}>
            <Text style={s.retryText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="car-outline" size={40} color={colors.textFaint} />
          <Text style={s.emptyTitle}>NO DRIVERS FOUND</Text>
          <Text style={s.emptyBody}>
            {query ? 'No match for that search.' : 'No drivers available right now.'}
          </Text>
        </View>
      ) : view === 'grid' ? (
        <FlatList
          key="grid"
          data={filtered}
          keyExtractor={item => item.handle}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GAP }}
          contentContainerStyle={{ padding: GRID_PAD, gap: GRID_GAP, paddingBottom: GRID_PAD + 48 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <GridCard
              driver={item}
              width={GRID_CARD_W}
              height={GRID_CARD_H}
              canDirect={canDirect}
              onHmu={handleHmu}
            />
          )}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color={colors.green} style={{ marginTop: spacing.lg }} />
          ) : null}
        />
      ) : (
        <View
          style={{ flex: 1 }}
          onLayout={e => setListHeight(e.nativeEvent.layout.height)}
        >
          <FlatList
            key="feed"
            data={filtered}
            keyExtractor={item => item.handle}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            pagingEnabled
            snapToAlignment="start"
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loadingMore ? (
              <View style={[s.center, { height: CARD_H }]}>
                <ActivityIndicator color={colors.green} />
              </View>
            ) : null}
          />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  topBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 36 },
  topTitle: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textPrimary, letterSpacing: 2 },
  topActions: { flexDirection: 'row', gap: spacing.xs },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 36 },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong, height: 36,
  },
  searchText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, paddingVertical: 0, paddingRight: spacing.md },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  filtersWrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  filterChipAccActive: { backgroundColor: colors.amberDim, borderColor: colors.amberBorder },
  filterChipText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },
  filterChipTextActive: { color: colors.green },
  filterChipAccTextActive: { color: colors.amber },
  filterSep: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.xs, alignSelf: 'stretch' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2, marginTop: spacing.sm },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 12, paddingHorizontal: spacing.xxl,
  },
  retryText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.bg, letterSpacing: 1.5 },
  emptyTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textSecondary, letterSpacing: 1 },
  emptyBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center' },

  // Card
  card: {
    position: 'relative', overflow: 'hidden',
    // Green top accent — consistent brand frame on every card
    borderTopWidth: 2,
    borderTopColor: colors.greenBorder,
  },
  fallbackBg: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  fallbackInitials: { fontFamily: fonts.display, fontSize: 96, color: colors.borderStrong },

  playBtn: { position: 'absolute', top: spacing.xl, right: spacing.xl },
  playIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },

  liveBadge: {
    position: 'absolute', top: spacing.xl, left: spacing.xl,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.greenBorder, maxWidth: SCREEN_W * 0.55,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  liveText: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 0.5 },

  scrim: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 260,
    backgroundColor: 'rgba(8,8,8,0.82)',
  },
  infoPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.xl, gap: spacing.sm,
  },

  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  displayName: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.textPrimary },
  handle: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, marginTop: 2 },

  priceWrap: { alignItems: 'flex-end' },
  priceDollar: { fontFamily: fonts.mono, fontSize: 12, color: colors.green, position: 'absolute', top: 2, left: -10 },
  priceValue: { fontFamily: fonts.display, fontSize: 32, color: colors.green, lineHeight: 34 },
  priceLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 0.5 },

  areasRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  areasText: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, flex: 1 },

  statsRow: { flexDirection: 'row', gap: spacing.md },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary },

  chipsRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },

  hmuBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: 'center',
    marginTop: spacing.xs,
  },
  hmuBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },

  comingSoonBtn: {
    backgroundColor: colors.card, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs,
  },
  comingSoonBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1.5 },

  downBadLink: { alignItems: 'center', paddingVertical: spacing.xs },
  downBadText: { fontFamily: fonts.body, fontSize: 12, color: colors.amber },
});

// ── Grid card styles ────────────────────────────────────────────────────────
const g = StyleSheet.create({
  card: {
    borderRadius: radius.card, overflow: 'hidden',
    backgroundColor: colors.cardAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  playBadge: {
    position: 'absolute', top: spacing.sm, right: spacing.sm,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  liveDot: {
    position: 'absolute', top: spacing.sm, left: spacing.sm,
    width: 9, height: 9, borderRadius: 5, backgroundColor: colors.green,
    borderWidth: 1.5, borderColor: colors.bg,
  },
  firstBadge: {
    position: 'absolute', top: spacing.sm, left: spacing.sm,
    backgroundColor: colors.cashDim, borderColor: colors.cashBorder, borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2,
  },
  firstBadgeText: { fontFamily: fonts.mono, fontSize: 8, color: colors.cash, letterSpacing: 0.6 },
  scrim: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 84,
    backgroundColor: 'rgba(8,8,8,0.78)',
  },
  info: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.sm, gap: 3 },
  name: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  price: { fontFamily: fonts.display, fontSize: 18, color: colors.green, lineHeight: 20 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statText: { fontFamily: fonts.mono, fontSize: 9, color: colors.textTertiary },
});
