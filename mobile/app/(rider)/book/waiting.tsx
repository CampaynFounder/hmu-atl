// Waiting screen — used by Direct Booking and Down Bad after submission.
// Polls /rides/active every 5s to detect when a driver accepts.
// Shows countdown to expiry + cancel action.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, useSharedValue, withRepeat, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useNotifications } from '@/contexts/notifications';

function useCountdown(expiresAt: string) {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const id = setInterval(() => setSecsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  return { secsLeft, display: `${mins}:${String(secs).padStart(2, '0')}` };
}

export default function WaitingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  // getToken changes identity every render. The countdown re-renders every
  // second, so a getToken-dependent checkAccepted callback would be recreated
  // each second and RESET the 5s poll interval before it ever fires — meaning
  // acceptance was never detected by the poll. Keep getToken in a ref.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const { type, postId, expiresAt, expiryMinutes, handle, price } = useLocalSearchParams<{
    type: 'direct' | 'down-bad';
    postId: string;
    expiresAt: string;
    expiryMinutes: string;
    handle?: string;
    price?: string;
  }>();

  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { activeRide, declinedRequest } = useNotifications();

  const { secsLeft, display: countdown } = useCountdown(expiresAt ?? '');
  const expired = secsLeft === 0;

  // Instant accept: the global notify channel sets activeRide the moment the
  // driver accepts (booking_accepted), so we route into the live ride screen
  // immediately — stopping the countdown without waiting on the 5s poll below.
  useEffect(() => {
    if (activeRide?.rideId && !activeRide.isDriver) {
      if (pollRef.current) clearInterval(pollRef.current);
      // Seed status so the active screen paints its shell ("DRIVER ACCEPTED" +
      // route) instantly instead of a blank loader while /rider-view resolves.
      const seed = `&seedStatus=${activeRide.status || 'matched'}`
        + (activeRide.pickupAddress ? `&seedPickup=${encodeURIComponent(activeRide.pickupAddress)}` : '')
        + (activeRide.dropoffAddress ? `&seedDropoff=${encodeURIComponent(activeRide.dropoffAddress)}` : '');
      router.replace(`/(rider)/ride/active?rideId=${activeRide.rideId}${seed}` as never);
    }
  }, [activeRide, router]);

  // Driver passed in real time — stop the countdown and surface the "driver
  // passed" screen with their reason. Scoped by postId so a stale decline for a
  // different request can't hijack this wait.
  useEffect(() => {
    if (declinedRequest && declinedRequest.postId === postId) {
      if (pollRef.current) clearInterval(pollRef.current);
      router.replace(`/(rider)/book/passed?postId=${postId}` as never);
    }
  }, [declinedRequest, postId, router]);

  const timerColor = secsLeft > 120 ? colors.green : secsLeft > 30 ? colors.amber : colors.red;

  // Pulse animation for the waiting dot
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.4, { duration: 900 }), -1, true);
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  // Poll /rides/active every 4s to catch acceptance. ANY active ride for this
  // rider means the driver accepted (one-active-ride-per-rider is enforced), so
  // route on hasActiveRide — not only the exact 'matched' status, which we'd
  // miss if the ride advanced quickly. Stable identity (getToken in a ref) so
  // the interval is NOT reset on every countdown tick.
  const checkAccepted = useCallback(async () => {
    try {
      const t = await getTokenRef.current();
      const data = await apiClient<{ hasActiveRide: boolean; status?: string; rideId?: string }>('/rides/active', t);
      if (data.hasActiveRide && data.rideId) {
        if (pollRef.current) clearInterval(pollRef.current);
        router.replace(`/(rider)/ride/active?rideId=${data.rideId}` as never);
      }
    } catch {}
  }, [router]);

  useEffect(() => {
    void checkAccepted(); // immediate check on mount — don't wait a full interval
    pollRef.current = setInterval(checkAccepted, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [checkAccepted]);

  async function cancel() {
    Alert.alert(
      type === 'direct' ? 'CANCEL REQUEST' : 'CANCEL POST',
      type === 'direct'
        ? `Cancel your request to @${handle}?`
        : 'Cancel your Down Bad post?',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Yes, cancel', style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const t = await getToken();
              if (type === 'direct' && handle) {
                await apiClient(`/drivers/${handle}/book`, t, { method: 'DELETE' });
              } else {
                await apiClient(`/rider/down-bad/${postId}/cancel`, t, { method: 'POST' });
              }
            } catch {}
            router.replace('/(rider)/home');
          },
        },
      ],
    );
  }

  const isDirectBooking = type === 'direct';

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={s.header}>
        <View style={{ width: 40 }} />
        <Text style={s.headerTitle}>
          {isDirectBooking ? 'DIRECT BOOKING' : 'DOWN BAD'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.content}>
        {/* Timer */}
        <Animated.View entering={FadeIn.duration(500)} style={s.timerWrap}>
          <Text style={s.timerLabel}>
            {expired ? 'EXPIRED' : isDirectBooking ? 'DRIVER HAS' : 'POST EXPIRES IN'}
          </Text>
          <Text style={[s.timer, { color: timerColor }]}>
            {expired ? '—' : countdown}
          </Text>
          {!expired && (
            <Text style={s.timerSub}>
              {isDirectBooking ? 'to accept your request' : ''}
            </Text>
          )}
        </Animated.View>

        {/* Status card */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={[s.statusCard, shadow.card]}>
          <View style={s.statusTop}>
            <Animated.View style={[s.statusDot, pulseStyle, !expired && { backgroundColor: colors.green }]} />
            <Text style={s.statusLabel}>
              {expired ? 'NO RESPONSE' : isDirectBooking ? 'WAITING FOR DRIVER' : 'WATCHING FOR DRIVERS'}
            </Text>
          </View>

          {isDirectBooking && handle && (
            <View style={s.driverChip}>
              <Text style={s.driverChipAt}>@</Text>
              <Text style={s.driverChipHandle}>{handle}</Text>
            </View>
          )}

          {!isDirectBooking && (
            <Text style={s.statusDesc}>
              Any driver who pulls up on your Down Bad post wins the job.
            </Text>
          )}

          {price && (
            <View style={s.priceRow}>
              <Ionicons name="cash-outline" size={13} color={colors.textFaint} />
              <Text style={s.priceText}>${price} offer</Text>
            </View>
          )}
        </Animated.View>

        {/* Instruction */}
        {!expired && (
          <Animated.View entering={FadeInUp.delay(350).duration(400)} style={s.instructionBox}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
            <Text style={s.instructionText}>
              {isDirectBooking
                ? "When the driver accepts, you'll enter pickup + dropoff details."
                : "Keep the app open. You'll be notified when a driver accepts."}
            </Text>
          </Animated.View>
        )}

        {expired && (
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <TouchableOpacity
              style={s.retryBtn}
              onPress={() => router.replace(`/(rider)/book/${isDirectBooking ? 'direct' : 'down-bad'}` as never)}
              activeOpacity={0.85}
            >
              <Text style={s.retryBtnText}>TRY AGAIN</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* Cancel */}
      {!expired && (
        <TouchableOpacity
          style={s.cancelBtn}
          onPress={cancel}
          disabled={cancelling}
          activeOpacity={0.7}
        >
          {cancelling
            ? <ActivityIndicator size="small" color={colors.red} />
            : <Text style={s.cancelText}>CANCEL {isDirectBooking ? 'REQUEST' : 'POST'}</Text>
          }
        </TouchableOpacity>
      )}

      {expired && (
        <TouchableOpacity
          style={s.homeBtn}
          onPress={() => router.replace('/(rider)/home')}
          activeOpacity={0.85}
        >
          <Text style={s.homeBtnText}>BACK TO HOME</Text>
        </TouchableOpacity>
      )}
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
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 1.5 },

  content: { flex: 1, padding: spacing.xl, gap: spacing.xl, justifyContent: 'center' },

  timerWrap: { alignItems: 'center', gap: spacing.xs },
  timerLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2 },
  timer: { fontFamily: fonts.display, fontSize: 56, letterSpacing: 2 },
  timerSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },

  statusCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.textFaint,
  },
  statusLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.textPrimary, letterSpacing: 1 },

  driverChip: {
    flexDirection: 'row', alignItems: 'baseline',
    alignSelf: 'flex-start',
    backgroundColor: colors.blueDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.blueBorder,
  },
  driverChipAt: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.blue },
  driverChipHandle: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textPrimary },

  statusDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },

  priceRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  priceText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },

  instructionBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  instructionText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, lineHeight: 20 },

  cancelBtn: { paddingVertical: spacing.lg, alignItems: 'center' },
  cancelText: { fontFamily: fonts.mono, fontSize: 11, color: colors.red, letterSpacing: 1 },

  homeBtn: {
    marginHorizontal: spacing.xl, marginBottom: spacing.lg,
    backgroundColor: colors.cardAlt, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  homeBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textSecondary, letterSpacing: 1.5 },

  retryBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: 'center',
  },
  retryBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
});
