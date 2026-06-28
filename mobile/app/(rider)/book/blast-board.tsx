// Blast Board — live offer board after blast is created.
// Subscribes to Ably channel `blast:{blastId}` for real-time driver HMUs.
// Rider selects a driver → POST /api/blast/{blastId}/select/{targetId} → home

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInRight, ZoomIn } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useAbly, AblyMessage } from '@/hooks/use-ably';

interface DriverOffer {
  targetId: string;
  driverId: string;
  handle: string;
  displayName: string | null;
  counterPrice: number | null;
  etaMinutes: number | null;
  receivedAt: number;
}

function useCountdown(expiresAt: string) {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSecsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  return { secsLeft, display: `${mins}:${String(secs).padStart(2, '0')}` };
}

export default function BlastBoard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const getToken = useStableToken();

  const { blastId, shortcode, expiresAt, targetedCount, price } = useLocalSearchParams<{
    blastId: string; shortcode: string; expiresAt: string; targetedCount: string; price: string;
  }>();

  const [token, setToken] = useState<string | null>(null);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [matched, setMatched] = useState(false);

  const { secsLeft, display: countdown } = useCountdown(expiresAt ?? '');
  const expired = secsLeft === 0;

  useEffect(() => {
    getToken().then(t => setToken(t ?? null));
  }, [getToken]);

  // Hydrate offers on mount/re-entry. The board otherwise only catches live
  // Ably HMUs (with a 2-min rewind), so returning to an active blast from the
  // My Requests surface would show an empty board. Seed from drivers who've
  // already HMU'd (hmuAt set); live events still append/update by targetId.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!blastId || !token || hydratedRef.current) return;
    hydratedRef.current = true;
    apiClient<{ targets: Array<Record<string, any>> }>(`/blast/${blastId}/targets`, token)
      .then(({ targets }) => {
        const hmud = (targets ?? [])
          .filter((t) => t.hmuAt)
          .map<DriverOffer>((t) => ({
            targetId: String(t.targetId ?? ''),
            driverId: String(t.driverId ?? ''),
            handle: String(t.handle ?? ''),
            displayName: (t.displayName ?? null) as string | null,
            counterPrice: t.counterPrice != null ? Number(t.counterPrice) : null,
            etaMinutes: null,
            receivedAt: t.hmuAt ? new Date(t.hmuAt).getTime() : Date.now(),
          }));
        if (!hmud.length) return;
        setOffers((prev) => {
          const byId = new Map(prev.map((o) => [o.targetId, o]));
          for (const o of hmud) if (!byId.has(o.targetId)) byId.set(o.targetId, o);
          return Array.from(byId.values()).sort((a, b) => b.receivedAt - a.receivedAt);
        });
      })
      .catch(() => { /* board still works via live events */ });
  }, [blastId, token]);

  const handleMessage = useCallback((msg: AblyMessage) => {
    const data = msg.data as Record<string, unknown>;

    // Driver HMU / counter offer
    if (msg.name === 'driver_hmu' || msg.name === 'hmu' || msg.name === 'counter_offer') {
      const offer: DriverOffer = {
        targetId: String(data.targetId ?? data.target_id ?? ''),
        driverId: String(data.driverId ?? data.driver_id ?? ''),
        handle: String(data.handle ?? ''),
        displayName: (data.displayName ?? data.display_name ?? null) as string | null,
        counterPrice: data.counterPrice != null ? Number(data.counterPrice) : data.counter_price != null ? Number(data.counter_price) : null,
        etaMinutes: data.etaMinutes != null ? Number(data.etaMinutes) : data.eta_minutes != null ? Number(data.eta_minutes) : null,
        receivedAt: Date.now(),
      };
      if (offer.targetId || offer.handle) {
        setOffers(prev => {
          const exists = prev.find(o => o.targetId === offer.targetId);
          if (exists) return prev.map(o => o.targetId === offer.targetId ? offer : o);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return [offer, ...prev];
        });
      }
    }

    // Blast matched (someone already selected)
    if (msg.name === 'blast_matched' || msg.name === 'matched') {
      setMatched(true);
    }
  }, []);

  useAbly({
    channelName: blastId ? `blast:${blastId}` : null,
    token,
    blastId,
    onMessage: handleMessage,
  });

  // Once matched (via select or a blast_matched event), resolve the ride and
  // drop the rider straight into the unified ride screen after the animation.
  useEffect(() => {
    if (!matched) return;
    const id = setTimeout(async () => {
      try {
        const t = await getToken();
        const d = await apiClient<{ rideId?: string }>('/rides/active', t);
        router.replace(d.rideId ? `/(rider)/ride/active?rideId=${d.rideId}` as never : '/(rider)/home');
      } catch { router.replace('/(rider)/home'); }
    }, 1400);
    return () => clearTimeout(id);
  }, [matched, getToken, router]);

  async function selectDriver(offer: DriverOffer) {
    if (!blastId || !offer.targetId) return;
    setSelecting(offer.targetId);
    try {
      const t = await getToken();
      await apiClient(`/blast/${blastId}/select/${offer.targetId}`, t, { method: 'POST' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMatched(true); // the matched effect routes into the ride screen
    } catch (e: any) {
      Alert.alert('Could not select driver', e.message ?? 'Try again');
      setSelecting(null);
    }
  }

  async function cancelBlast() {
    Alert.alert(
      'CANCEL BLAST',
      'Cancel this blast? Drivers who responded will be notified.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel blast', style: 'destructive',
          onPress: async () => {
            try {
              const t = await getToken();
              await apiClient(`/blast/${blastId}/cancel`, t, { method: 'POST' });
            } catch {}
            router.replace('/(rider)/home');
          },
        },
      ],
    );
  }

  const timerColor = secsLeft > 120 ? colors.green : secsLeft > 30 ? colors.amber : colors.red;

  if (matched) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <Animated.View entering={ZoomIn.duration(400)} style={s.matchedWrap}>
          <View style={[s.matchedIcon, { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }]}>
            <Ionicons name="checkmark-circle" size={56} color={colors.green} />
          </View>
          <Text style={s.matchedTitle}>DRIVER MATCHED</Text>
          <Text style={s.matchedBody}>Heading to your home screen...</Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={cancelBlast} style={s.cancelBtn}>
          <Text style={s.cancelText}>CANCEL</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>BLAST #{shortcode}</Text>
          <Text style={[s.timer, { color: timerColor }]}>{expired ? 'EXPIRED' : countdown}</Text>
        </View>
        <View style={[s.liveDot, { backgroundColor: expired ? colors.textFaint : colors.green }]}>
          <View style={[s.liveDotInner, { backgroundColor: expired ? colors.textFaint : colors.green }]} />
        </View>
      </View>

      {/* Stats bar */}
      <View style={s.statsBar}>
        <Text style={s.statItem}>
          <Text style={s.statValue}>{Number(targetedCount ?? 0)}</Text>
          <Text style={s.statLabel}> drivers targeted</Text>
        </Text>
        <Text style={s.statSep}>·</Text>
        <Text style={s.statItem}>
          <Text style={s.statValue}>{offers.length}</Text>
          <Text style={s.statLabel}> HMU'd</Text>
        </Text>
        <Text style={s.statSep}>·</Text>
        <Text style={s.statItem}>
          <Text style={s.statValue}>${price ?? '?'}</Text>
          <Text style={s.statLabel}> offer</Text>
        </Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
      >
        {offers.length === 0 && !expired && (
          <Animated.View entering={FadeIn.duration(400)} style={s.waiting}>
            <ActivityIndicator color={colors.green} style={{ marginBottom: spacing.md }} />
            <Text style={s.waitingTitle}>WAITING FOR DRIVERS</Text>
            <Text style={s.waitingBody}>
              Drivers in your area are seeing your blast.{'\n'}HMUs will appear here in real time.
            </Text>
          </Animated.View>
        )}

        {expired && offers.length === 0 && (
          <Animated.View entering={FadeIn.duration(400)} style={s.waiting}>
            <Ionicons name="time-outline" size={40} color={colors.textFaint} style={{ marginBottom: spacing.md }} />
            <Text style={s.waitingTitle}>BLAST EXPIRED</Text>
            <Text style={s.waitingBody}>No drivers responded in time. Try blasting again.</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => router.replace('/(rider)/book/blast' as never)}>
              <Text style={s.retryBtnText}>BLAST AGAIN</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {offers.map((offer, idx) => (
          <Animated.View key={offer.targetId || idx} entering={FadeInRight.delay(idx * 60).springify()}>
            <View style={[s.offerCard, shadow.card]}>
              <View style={s.offerLeft}>
                <View style={[s.offerAvatar, { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }]}>
                  <Text style={s.offerAvatarLetter}>
                    {(offer.displayName ?? offer.handle)[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <View style={s.offerInfo}>
                  <Text style={s.offerHandle}>@{offer.handle}</Text>
                  {offer.displayName && <Text style={s.offerName}>{offer.displayName}</Text>}
                  {offer.etaMinutes != null && (
                    <View style={s.etaRow}>
                      <Ionicons name="time-outline" size={11} color={colors.textFaint} />
                      <Text style={s.etaText}>{offer.etaMinutes} min away</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={s.offerRight}>
                {offer.counterPrice != null && (
                  <Text style={s.offerPrice}>${offer.counterPrice}</Text>
                )}
                <TouchableOpacity
                  style={[s.selectBtn, selecting === offer.targetId && { opacity: 0.6 }]}
                  onPress={() => selectDriver(offer)}
                  disabled={!!selecting}
                  activeOpacity={0.85}
                >
                  {selecting === offer.targetId
                    ? <ActivityIndicator size="small" color={colors.bg} />
                    : <Text style={s.selectBtnText}>PULL UP</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cancelBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  cancelText: { fontFamily: fonts.mono, fontSize: 10, color: colors.red, letterSpacing: 1 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },
  timer: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1 },
  liveDot: {
    width: 10, height: 10, borderRadius: 5,
  },
  liveDotInner: { width: 6, height: 6, borderRadius: 3, margin: 2 },

  statsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, gap: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  statItem: {},
  statValue: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary },
  statLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  statSep: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },

  scroll: { flex: 1 },
  listContent: { padding: spacing.xl, gap: spacing.md, paddingBottom: 40 },

  waiting: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl, gap: spacing.sm },
  waitingTitle: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textPrimary, letterSpacing: 1 },
  waitingBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 },

  retryBtn: {
    marginTop: spacing.lg, backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 13, paddingHorizontal: spacing.xxl,
  },
  retryBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.bg, letterSpacing: 1.5 },

  offerCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  offerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  offerAvatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  offerAvatarLetter: { fontFamily: fonts.display, fontSize: 24, color: colors.green },
  offerInfo: { flex: 1, gap: 2 },
  offerHandle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary },
  offerName: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  etaText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },

  offerRight: { alignItems: 'flex-end', gap: spacing.sm },
  offerPrice: { fontFamily: fonts.display, fontSize: 24, color: colors.green },
  selectBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 10, paddingHorizontal: spacing.lg,
  },
  selectBtnText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.bg, letterSpacing: 1.5 },

  matchedWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  matchedIcon: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  matchedTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.green, letterSpacing: 2 },
  matchedBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary },
});
