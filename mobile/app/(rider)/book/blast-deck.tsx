// Blast Deck — Tinder-style swipe through targeted drivers after creating a blast.
// Swipe RIGHT = HMU (notifies driver, they can accept)
// Swipe LEFT  = Nah (skip, no notification)
// First driver to accept after being HMU'd → auto-select → match.
// Losers receive SMS via sendBlastTakenSms (called by select endpoint).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, Image, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useAbly } from '@/hooks/use-ably';
import { CommentsAccordion } from '@/components/CommentsAccordion';

const { width: W, height: H } = Dimensions.get('window');
const SWIPE_THRESHOLD = W * 0.32;

// ── Types ─────────────────────────────────────────────────────────────────────

interface TargetedDriver {
  targetId: string;
  driverId: string;
  handle: string;
  displayName: string;
  videoUrl: string | null;
  photoUrl: string | null;
  minPrice: number;
  vehicleSummary: string | null;
  tier: string;
  chillScore: number;
  acceptanceRate: number | null;
  distanceMi: number | null;
  ratings: { chill: number; coolAf: number; kindaCreepy: number; weirdo: number };
  hmuAt: string | null;
  passedAt: string | null;
  counterPrice: number | null;
  minutesAway: number | null;
}

// ── Rating chips ──────────────────────────────────────────────────────────────

function RatingChips({ ratings }: { ratings: TargetedDriver['ratings'] }) {
  const chips = [
    { label: '✅ CHILL',      count: ratings.chill,       color: colors.green,  dim: colors.greenDim,  border: colors.greenBorder },
    { label: '😎 COOL AF',    count: ratings.coolAf,      color: colors.blue,   dim: colors.blueDim,   border: colors.blueBorder },
    { label: '👀 KINDA CREEPY', count: ratings.kindaCreepy, color: colors.amber,  dim: colors.amberDim,  border: colors.amberBorder },
    { label: '🚩 WEIRDO',     count: ratings.weirdo,      color: colors.red,    dim: colors.redDim,    border: colors.redBorder },
  ].filter(c => c.count > 0);

  if (!chips.length) return null;
  return (
    <View style={dc.chips}>
      {chips.map(c => (
        <View key={c.label} style={[dc.chip, { backgroundColor: c.dim, borderColor: c.border }]}>
          <Text style={[dc.chipText, { color: c.color }]}>{c.label} {c.count}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Single swipeable card ─────────────────────────────────────────────────────

function DriverCard({
  driver, onSwipeRight, onSwipeLeft, isTop, stackIndex, token,
}: {
  driver: TargetedDriver;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  isTop: boolean;
  stackIndex: number;
  token: string | null;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const gesture = Gesture.Pan()
    .enabled(isTop)
    .onChange(e => {
      tx.value += e.changeX;
      ty.value += e.changeY * 0.15;
    })
    .onFinalize(e => {
      const rightSwipe = tx.value > SWIPE_THRESHOLD || e.velocityX > 700;
      const leftSwipe  = tx.value < -SWIPE_THRESHOLD || e.velocityX < -700;
      if (rightSwipe) {
        tx.value = withSpring(W * 1.6, { velocity: e.velocityX });
        ty.value = withSpring(0);
        runOnJS(onSwipeRight)();
      } else if (leftSwipe) {
        tx.value = withSpring(-W * 1.6, { velocity: e.velocityX });
        ty.value = withSpring(0);
        runOnJS(onSwipeLeft)();
      } else {
        tx.value = withSpring(0, { damping: 18 });
        ty.value = withSpring(0, { damping: 18 });
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-W * 0.5, 0, W * 0.5], [-14, 0, 14]);
    const scale  = interpolate(stackIndex, [0, 1, 2], [1, 0.95, 0.9]);
    const transY = interpolate(stackIndex, [0, 1, 2], [0, 12, 22]);
    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value + transY },
        { rotateZ: `${rotate}deg` },
        { scale },
      ],
    };
  });

  const hmuStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, 80, 160], [0, 0.6, 1], Extrapolation.CLAMP),
  }));
  const nahStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-160, -80, 0], [1, 0.6, 0], Extrapolation.CLAMP),
  }));

  const hasPhoto = !!driver.photoUrl;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[dc.card, cardStyle, shadow.card]}>
        {/* Background photo */}
        {hasPhoto ? (
          <Image source={{ uri: driver.photoUrl! }} style={dc.photo} resizeMode="cover" />
        ) : (
          <View style={[dc.photo, dc.photoFallback]}>
            <Text style={dc.photoInitial}>{(driver.displayName || driver.handle)[0]?.toUpperCase()}</Text>
          </View>
        )}

        {/* HMU / NAH overlays */}
        <Animated.View style={[dc.indicator, dc.indicatorRight, hmuStyle]}>
          <Text style={dc.indicatorText}>HMU</Text>
        </Animated.View>
        <Animated.View style={[dc.indicator, dc.indicatorLeft, nahStyle]}>
          <Text style={dc.indicatorText}>NAH</Text>
        </Animated.View>

        {/* Info panel */}
        <View style={dc.scrim} />
        <View style={dc.info}>
          {/* Name + price */}
          <View style={dc.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={dc.name} numberOfLines={1}>{driver.displayName}</Text>
              <Text style={dc.handle}>@{driver.handle}</Text>
            </View>
            <View style={dc.priceWrap}>
              <Text style={dc.priceLabel}>from</Text>
              <Text style={dc.price}>${driver.minPrice}</Text>
            </View>
          </View>

          {/* Stats row */}
          <View style={dc.stats}>
            {driver.minutesAway != null && (
              <View style={[dc.stat, dc.statEta]}>
                <Ionicons name="time-outline" size={12} color={colors.green} />
                <Text style={[dc.statText, { color: colors.green }]}>~{driver.minutesAway} min away</Text>
              </View>
            )}
            {driver.distanceMi != null && (
              <View style={dc.stat}>
                <Ionicons name="location-outline" size={12} color={colors.textFaint} />
                <Text style={dc.statText}>{driver.distanceMi.toFixed(1)} mi</Text>
              </View>
            )}
            {driver.chillScore > 0 && (
              <View style={dc.stat}>
                <Ionicons name="star" size={12} color={colors.green} />
                <Text style={dc.statText}>{driver.chillScore}%</Text>
              </View>
            )}
            {driver.acceptanceRate != null && (
              <View style={dc.stat}>
                <Ionicons name="checkmark-circle" size={12} color={
                  driver.acceptanceRate >= 90 ? colors.green :
                  driver.acceptanceRate >= 75 ? colors.amber : colors.textFaint
                } />
                <Text style={dc.statText}>{driver.acceptanceRate}% acc</Text>
              </View>
            )}
            {driver.vehicleSummary && (
              <View style={dc.stat}>
                <Ionicons name="car-outline" size={12} color={colors.textFaint} />
                <Text style={dc.statText} numberOfLines={1}>{driver.vehicleSummary}</Text>
              </View>
            )}
            {driver.tier === 'hmu_first' && (
              <View style={[dc.stat, { backgroundColor: colors.cashDim, borderColor: colors.cashBorder, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6 }]}>
                <Text style={[dc.statText, { color: colors.cash }]}>HMU 1ST</Text>
              </View>
            )}
          </View>

          {/* Rating chips */}
          <RatingChips ratings={driver.ratings} />

          {/* Comments accordion */}
          <CommentsAccordion handle={driver.handle} token={token} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ── Action buttons ────────────────────────────────────────────────────────────

function ActionButtons({ onNah, onHmu, disabled }: {
  onNah: () => void; onHmu: () => void; disabled: boolean;
}) {
  return (
    <View style={ab.row}>
      <TouchableOpacity style={[ab.btn, ab.nah]} onPress={onNah} disabled={disabled} activeOpacity={0.8}>
        <Ionicons name="close" size={28} color={colors.red} />
        <Text style={[ab.label, { color: colors.red }]}>NAH</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[ab.btn, ab.hmu]} onPress={onHmu} disabled={disabled} activeOpacity={0.8}>
        <Ionicons name="paper-plane" size={28} color={colors.green} />
        <Text style={[ab.label, { color: colors.green }]}>HMU</Text>
      </TouchableOpacity>
    </View>
  );
}

const ab = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xxxl, paddingVertical: spacing.xl },
  btn: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1.5, gap: 2,
  },
  nah: { borderColor: colors.redBorder },
  hmu: { borderColor: colors.greenBorder },
  label: { fontFamily: fonts.monoBold, fontSize: 9, letterSpacing: 1 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function BlastDeck() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const { blastId, shortcode, expiresAt, price } = useLocalSearchParams<{
    blastId: string; shortcode: string; expiresAt: string; price: string;
  }>();

  const [drivers, setDrivers] = useState<TargetedDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [hmuSent, setHmuSent] = useState<Set<string>>(new Set()); // targetIds we HMU'd
  const [matched, setMatched] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const selectingRef = useRef(false);

  useEffect(() => {
    getToken().then(t => setToken(t ?? null));
  }, [getToken]);

  // Load targeted drivers
  useEffect(() => {
    if (!blastId || !token) return;
    apiClient<{ targets: TargetedDriver[] }>(`/blast/${blastId}/targets`, token)
      .then(d => setDrivers(d.targets ?? []))
      .catch(() => Alert.alert('Error', 'Could not load drivers'))
      .finally(() => setLoading(false));
  }, [blastId, token]);

  // Listen for driver responses via Ably
  const handleAblyMessage = useCallback((msg: { name: string; data: unknown }) => {
    const data = msg.data as Record<string, unknown>;
    const eventTargetId = String(data.targetId ?? data.target_id ?? '');

    // Driver HMU'd back after rider swiped right → auto-select them
    if (msg.name === 'target_hmu' && hmuSent.has(eventTargetId) && !selectingRef.current) {
      selectingRef.current = true;
      getToken().then(async t => {
        try {
          await apiClient(`/blast/${blastId}/select/${eventTargetId}`, t, { method: 'POST' });
          setMatched(true);
          setTimeout(() => router.replace('/(rider)/home'), 1800);
        } catch {
          // Already matched by someone else — go home anyway
          setMatched(true);
          setTimeout(() => router.replace('/(rider)/home'), 1800);
        }
      });
    }
    // Someone else already matched
    if (msg.name === 'match_locked') {
      setMatched(true);
      setTimeout(() => router.replace('/(rider)/home'), 1800);
    }
  }, [blastId, hmuSent, getToken, router]);

  useAbly({ channelName: blastId ? `blast:${blastId}` : null, token, blastId, onMessage: handleAblyMessage });

  // ── Swipe handlers ───────────────────────────────────────────────────────

  async function handleHmu(driver: TargetedDriver) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setHmuSent(prev => new Set(prev).add(driver.targetId));
    try {
      const t = await getToken();
      await apiClient(`/blast/${blastId}/hmu/${driver.targetId}`, t, { method: 'POST' });
    } catch { /* non-fatal — we still track locally */ }
    advance();
  }

  function handleNah() {
    void Haptics.selectionAsync();
    advance();
  }

  function advance() {
    setCurrentIdx(i => i + 1);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const remaining = drivers.slice(currentIdx);
  const visibleCards = remaining.slice(0, 3);
  const isDone = !loading && (currentIdx >= drivers.length);
  const hmuCount = hmuSent.size;

  if (matched) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <Animated.View style={s.matchedWrap}>
          <View style={[s.matchedIcon, { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.green} />
          </View>
          <Text style={s.matchedTitle}>DRIVER MATCHED</Text>
          <Text style={s.matchedBody}>Taking you to your ride...</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>BLAST #{shortcode}</Text>
          {hmuCount > 0 && (
            <Text style={s.hmuCount}>{hmuCount} HMU sent · waiting for response</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Card stack */}
      <View style={s.deckArea}>
        {loading ? (
          <ActivityIndicator color={colors.green} size="large" />
        ) : isDone ? (
          <View style={s.doneWrap}>
            <Ionicons name="checkmark-circle-outline" size={48} color={colors.textFaint} />
            <Text style={s.doneTitle}>
              {hmuCount > 0 ? `${hmuCount} HMU${hmuCount > 1 ? 's' : ''} sent` : 'No more drivers'}
            </Text>
            <Text style={s.doneBody}>
              {hmuCount > 0
                ? 'Waiting for a driver to respond. You\'ll be matched automatically.'
                : 'No drivers were targeted in your area for this blast.'}
            </Text>
            <TouchableOpacity style={s.homeBtn} onPress={() => router.replace('/(rider)/home')} activeOpacity={0.85}>
              <Text style={s.homeBtnText}>BACK TO HOME</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Render stack bottom-to-top so top card is last (renders on top)
          [...visibleCards].reverse().map((driver, revIdx) => {
            const stackIndex = visibleCards.length - 1 - revIdx;
            const isTop = stackIndex === 0;
            return (
              <View key={`${driver.targetId}-${currentIdx + stackIndex}`} style={StyleSheet.absoluteFill}>
                <DriverCard
                  driver={driver}
                  stackIndex={stackIndex}
                  isTop={isTop}
                  onSwipeRight={() => void handleHmu(driver)}
                  onSwipeLeft={handleNah}
                  token={token}
                />
              </View>
            );
          })
        )}
      </View>

      {/* Action buttons */}
      {!loading && !isDone && (
        <ActionButtons
          onNah={handleNah}
          onHmu={() => void handleHmu(remaining[0])}
          disabled={false}
        />
      )}

      {/* Progress */}
      {!loading && drivers.length > 0 && (
        <Text style={s.progress}>
          {Math.min(currentIdx + 1, drivers.length)} / {drivers.length} drivers
        </Text>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const CARD_W = W - spacing.xl * 2;
const CARD_H = H * 0.60;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.green, letterSpacing: 2 },
  hmuCount: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, marginTop: 2 },

  deckArea: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },

  progress: {
    fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint,
    textAlign: 'center', letterSpacing: 1, paddingBottom: spacing.sm,
  },

  doneWrap: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  doneTitle: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textSecondary, letterSpacing: 1 },
  doneBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 22 },
  homeBtn: {
    marginTop: spacing.md, backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 14, paddingHorizontal: spacing.xxl,
  },
  homeBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.bg, letterSpacing: 1.5 },

  matchedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  matchedIcon: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  matchedTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.green, letterSpacing: 2 },
  matchedBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary },
});

const dc = StyleSheet.create({
  card: {
    width: CARD_W, height: CARD_H,
    borderRadius: 24, overflow: 'hidden',
    backgroundColor: colors.card,
    position: 'absolute',
    top: 0,
    borderTopWidth: 2, borderTopColor: colors.greenBorder,
  },
  photo: { ...StyleSheet.absoluteFill },
  photoFallback: {
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
  },
  photoInitial: { fontFamily: fonts.display, fontSize: 100, color: colors.border },

  indicator: {
    position: 'absolute', top: spacing.xl, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, borderRadius: radius.cardInner, borderWidth: 3,
  },
  indicatorRight: { left: spacing.xl, borderColor: colors.green, backgroundColor: colors.greenDim },
  indicatorLeft:  { right: spacing.xl, borderColor: colors.red,   backgroundColor: colors.redDim },
  indicatorText: { fontFamily: fonts.display, fontSize: 28, letterSpacing: 2, color: colors.textPrimary },

  scrim: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 220,
    backgroundColor: 'rgba(8,8,8,0.86)',
  },
  info: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.xl, gap: spacing.sm },

  nameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  name: { fontFamily: fonts.monoBold, fontSize: 17, color: colors.textPrimary },
  handle: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, marginTop: 2 },
  priceWrap: { alignItems: 'flex-end' },
  priceLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint },
  price: { fontFamily: fonts.display, fontSize: 28, color: colors.green, lineHeight: 30 },

  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statEta: {
    backgroundColor: colors.greenDim, borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: colors.greenBorder,
  },
  statText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  chipText: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.5 },
});
