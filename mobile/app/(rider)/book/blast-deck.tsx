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
import { useVideoPlayer, VideoView } from 'expo-video';

const { width: W } = Dimensions.get('window');
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

// ── Autoplaying video background (top card only) ──────────────────────────────
// TikTok-style: the driver's intro video autoplays muted + looping behind the
// card, with their photo as the poster/fallback underneath.

function CardVideo({ uri, poster }: { uri: string; poster: string | null }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View style={StyleSheet.absoluteFill}>
      {poster ? <Image source={{ uri: poster }} style={dc.photo} resizeMode="cover" alt="" /> : null}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
    </View>
  );
}

// ── Single swipeable card ─────────────────────────────────────────────────────

function DriverCard({
  driver, onSwipeRight, onSwipeLeft, isTop, stackIndex,
}: {
  driver: TargetedDriver;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  isTop: boolean;
  stackIndex: number;
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

  const initial = (driver.displayName || driver.handle || '?')[0]?.toUpperCase();

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[dc.card, cardStyle, shadow.card]}>
        {/* Full-bleed media: autoplay video (top card) → photo → initial */}
        {isTop && driver.videoUrl ? (
          <CardVideo uri={driver.videoUrl} poster={driver.photoUrl} />
        ) : driver.photoUrl ? (
          <Image source={{ uri: driver.photoUrl }} style={dc.photo} resizeMode="cover" alt="" />
        ) : (
          <View style={[dc.photo, dc.photoFallback]}>
            <Text style={dc.photoInitial}>{initial}</Text>
          </View>
        )}

        {/* HMU / NAH swipe overlays */}
        <Animated.View style={[dc.indicator, dc.indicatorRight, hmuStyle]}>
          <Text style={dc.indicatorText}>HMU</Text>
        </Animated.View>
        <Animated.View style={[dc.indicator, dc.indicatorLeft, nahStyle]}>
          <Text style={dc.indicatorText}>NAH</Text>
        </Animated.View>

        {/* Minimal overlay: name/@handle · minutes away · price + on-card actions */}
        <View style={dc.scrim} />
        <View style={dc.info}>
          <View style={dc.infoLeft}>
            <Text style={dc.name} numberOfLines={1}>{driver.displayName}</Text>
            <Text style={dc.handle}>@{driver.handle}</Text>
            {driver.minutesAway != null && (
              <View style={dc.metaRow}>
                <Ionicons name="time-outline" size={13} color={colors.green} />
                <Text style={dc.metaText}>~{driver.minutesAway} min away</Text>
              </View>
            )}
            <Text style={dc.price}>
              <Text style={dc.priceLabel}>from </Text>${driver.minPrice}
            </Text>
          </View>

          {isTop && (
            <View style={dc.actions}>
              <TouchableOpacity style={[dc.actBtn, dc.passBtn]} onPress={onSwipeLeft} activeOpacity={0.85}>
                <Ionicons name="close" size={26} color={colors.red} />
              </TouchableOpacity>
              <TouchableOpacity style={[dc.actBtn, dc.hmuBtn]} onPress={onSwipeRight} activeOpacity={0.85}>
                <Ionicons name="paper-plane" size={24} color={colors.bg} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

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
        } catch { /* already matched by someone else */ }
        setMatched(true); // the matched effect routes into the ride screen
      });
    }
    // Someone else already matched
    if (msg.name === 'match_locked') {
      setMatched(true);
    }
  }, [blastId, hmuSent, getToken, router]);

  // Once matched, resolve the ride and go straight into the unified ride screen.
  useEffect(() => {
    if (!matched) return;
    const id = setTimeout(async () => {
      try {
        const t = await getToken();
        const d = await apiClient<{ rideId?: string }>('/rides/active', t);
        router.replace(d.rideId ? `/(rider)/ride/active?rideId=${d.rideId}` as never : '/(rider)/home');
      } catch { router.replace('/(rider)/home'); }
    }, 1600);
    return () => clearTimeout(id);
  }, [matched, getToken, router]);

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
                />
              </View>
            );
          })
        )}
      </View>

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
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 24, overflow: 'hidden',
    backgroundColor: colors.card,
  },
  photo: { ...StyleSheet.absoluteFill },
  photoFallback: {
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
  },
  photoInitial: { fontFamily: fonts.display, fontSize: 120, color: colors.border },

  indicator: {
    position: 'absolute', top: spacing.xxl, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, borderRadius: radius.cardInner, borderWidth: 3,
  },
  indicatorRight: { left: spacing.xl, borderColor: colors.green, backgroundColor: colors.greenDim },
  indicatorLeft:  { right: spacing.xl, borderColor: colors.red,   backgroundColor: colors.redDim },
  indicatorText: { fontFamily: fonts.display, fontSize: 28, letterSpacing: 2, color: colors.textPrimary },

  scrim: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 260,
    backgroundColor: 'rgba(8,8,8,0.82)',
  },
  info: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.xl,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.lg,
  },
  infoLeft: { flex: 1, gap: 4 },
  name: { fontFamily: fonts.monoBold, fontSize: 20, color: colors.textPrimary },
  handle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  metaText: { fontFamily: fonts.mono, fontSize: 12, color: colors.green },
  priceLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
  price: { fontFamily: fonts.display, fontSize: 30, color: colors.green, marginTop: 2 },

  actions: { flexDirection: 'column-reverse', gap: spacing.md, alignItems: 'center' },
  actBtn: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  passBtn: { backgroundColor: 'rgba(8,8,8,0.5)', borderColor: colors.redBorder },
  hmuBtn: { backgroundColor: colors.green, borderColor: colors.green },
});
