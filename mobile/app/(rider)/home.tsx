import { useCallback, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useStableToken } from '@/hooks/use-stable-token';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInUp,
  useSharedValue, useAnimatedStyle, withSpring,
} from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { PaymentGate } from '@/components/PaymentGate';

interface ActiveRide {
  hasActiveRide: boolean;
  rideId?: string;
  status?: string;
  isDriver?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  matched: 'DRIVER ACCEPTED',
  otw: 'DRIVER EN ROUTE',
  here: 'DRIVER ARRIVED',
  active: 'RIDE IN PROGRESS',
  in_progress: 'RIDE IN PROGRESS',
};

interface BookingMode {
  type: 'direct' | 'blast' | 'down-bad' | 'delivery';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  colorDim: string;
  colorBorder: string;
  title: string;
  subtitle: string;
  desc: string;
  cta: string;
  delay: number;
}

// Which booking types are live for the rider's market. Defaults to all-on so
// there's no "coming soon" flash before /rider/booking-availability resolves
// (the home spinner covers that first fetch).
interface BookingAvailability {
  direct: boolean;
  blast: boolean;
  downBad: boolean;
  delivery: boolean;
}

// Booking card `type` → availability key (down-bad's API key is camelCase).
const AVAIL_KEY: Record<BookingMode['type'], keyof BookingAvailability> = {
  direct: 'direct',
  blast: 'blast',
  'down-bad': 'downBad',
  delivery: 'delivery',
};

const BOOKING_MODES: BookingMode[] = [
  {
    type: 'direct',
    icon: 'person-circle-outline',
    color: colors.blue,
    colorDim: colors.blueDim,
    colorBorder: colors.blueBorder,
    title: 'DIRECT',
    subtitle: 'PULL UP ON YOUR DRIVER',
    desc: 'Book a driver directly. They get 5 minutes to respond.',
    cta: 'PICK A DRIVER',
    delay: 0,
  },
  {
    type: 'blast',
    icon: 'radio-outline',
    color: colors.green,
    colorDim: colors.greenDim,
    colorBorder: colors.greenBorder,
    title: 'HMU NETWORK',
    subtitle: 'SEND TO NEARBY DRIVERS',
    desc: 'Set your price. Send HMU to nearby drivers. Pick who you want.',
    cta: 'GET OFFERS',
    delay: 80,
  },
  {
    type: 'down-bad',
    icon: 'flash-outline',
    color: colors.amber,
    colorDim: colors.amberDim,
    colorBorder: colors.amberBorder,
    title: 'DOWN BAD',
    subtitle: 'FIRST DRIVER WINS',
    desc: 'In a bind? What else you offering? Our drivers understand.',
    cta: "I'M GOOD FOR IT",
    delay: 160,
  },
  {
    type: 'delivery',
    icon: 'bag-handle-outline',
    color: colors.pink,
    colorDim: colors.pinkDim,
    colorBorder: colors.pinkBorder,
    title: 'REQUEST STORE RUN',
    subtitle: 'GET ANYTHING DELIVERED',
    desc: 'Add the items. Get delivery direct to your door.',
    cta: 'REQUEST ITEMS',
    delay: 240,
  },
];

export default function RiderHome() {
  const getToken = useStableToken();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [activeReqCount, setActiveReqCount] = useState(0);
  const [availability, setAvailability] = useState<BookingAvailability>({
    direct: true, blast: true, downBad: true, delivery: true,
  });
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);

  const checkActive = useCallback(async () => {
    try {
      const t = await getToken();
      const [ride, blast, direct, downBad, delivery, avail] = await Promise.allSettled([
        apiClient<ActiveRide>('/rides/active', t),
        apiClient<{ blast: unknown }>('/blast/active', t),
        apiClient<{ post: unknown }>('/rider/direct/active', t),
        apiClient<{ post: unknown }>('/rider/down-bad/active', t),
        apiClient<{ delivery: unknown }>('/delivery/active', t),
        apiClient<BookingAvailability>('/rider/booking-availability', t),
      ]);
      if (avail.status === 'fulfilled' && avail.value) setAvailability(avail.value);
      // An in-flight ride (not yet ended) counts as an active item too, so the
      // home banner points the rider to Requests where the ride is managed.
      const r = ride.status === 'fulfilled' ? ride.value : null;
      const hasRide = !!(r?.hasActiveRide && !r.isDriver && r.status !== 'ended');
      setActiveReqCount(
        (hasRide ? 1 : 0) +
        (blast.status === 'fulfilled' && blast.value.blast ? 1 : 0) +
        (direct.status === 'fulfilled' && direct.value.post ? 1 : 0) +
        (downBad.status === 'fulfilled' && downBad.value.post ? 1 : 0) +
        (delivery.status === 'fulfilled' && delivery.value.delivery ? 1 : 0),
      );
    } catch {
      setActiveReqCount(0);
    } finally {
      setLoading(false);
      hasLoaded.current = true;
    }
  }, [getToken]);

  // First focus: show spinner. Subsequent focuses: silent background refresh.
  useFocusEffect(useCallback(() => {
    if (!hasLoaded.current) setLoading(true);
    void checkActive();
  }, [checkActive]));

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>HMU</Text>
        <Text style={s.sub}>ATL</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.green} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Active trip + requests are managed on the Requests page — home just
              points there and always shows the booking categories. */}
          {activeReqCount > 0 && (
            <Animated.View entering={FadeIn.duration(350)}>
              <TouchableOpacity
                style={[s.blastBanner, shadow.card]}
                onPress={() => router.push('/(rider)/requests' as never)}
                activeOpacity={0.85}
              >
                <View style={s.blastBannerLeft}>
                  <View style={s.blastDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.blastBannerLabel}>
                      {activeReqCount > 1 ? `${activeReqCount} ACTIVE` : 'ACTIVE REQUEST'}
                    </Text>
                    <Text style={s.blastBannerSub}>Tap to track your ride & manage requests</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.green} />
              </TouchableOpacity>
            </Animated.View>
          )}

          <Animated.Text entering={FadeIn.delay(50).duration(400)} style={s.sectionLabel}>
            WHAT DO YOU NEED?
          </Animated.Text>
          <PaymentGate>
            {BOOKING_MODES.map((mode) => (
              <BookingCard
                key={mode.type}
                mode={mode}
                enabled={availability[AVAIL_KEY[mode.type]]}
                onPress={() => router.push(`/(rider)/book/${mode.type}` as never)}
              />
            ))}
          </PaymentGate>
        </ScrollView>
      )}
    </View>
  );
}

function BookingCard({ mode, enabled, onPress }: { mode: BookingMode; enabled: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Disabled types still render (so riders learn what's coming) but as a
  // greyed, non-interactive "COMING SOON" tile — accent stripe and colored
  // CTA drop out; the one-line description stays.
  if (!enabled) {
    return (
      <Animated.View entering={FadeInUp.delay(mode.delay).duration(400)}>
        <View
          style={[s.bookCard, s.bookCardDisabled, { borderColor: colors.border }]}
          accessibilityState={{ disabled: true }}
        >
          <View style={[s.bookAccent, { backgroundColor: colors.border }]} />
          <View style={s.bookBody}>
            <View style={s.bookTop}>
              <View style={[s.bookIconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={mode.icon} size={22} color={colors.textFaint} />
              </View>
              <View style={s.bookTitles}>
                <Text style={[s.bookTitle, { color: colors.textTertiary }]}>{mode.title}</Text>
                <Text style={s.bookSubtitle}>{mode.subtitle}</Text>
              </View>
              <View style={s.comingSoonPill}>
                <Text style={s.comingSoonText}>COMING SOON</Text>
              </View>
            </View>
            <Text style={s.bookDesc}>{mode.desc}</Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      entering={FadeInUp.delay(mode.delay).duration(400)}
      style={animStyle}
    >
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 20, stiffness: 300 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 300 }); }}
        onPress={onPress}
      >
        <View style={[s.bookCard, shadow.card, { borderColor: mode.colorBorder }]}>
          {/* Left accent stripe */}
          <View style={[s.bookAccent, { backgroundColor: mode.color }]} />

          <View style={s.bookBody}>
            <View style={s.bookTop}>
              <View style={[s.bookIconWrap, { backgroundColor: mode.colorDim, borderColor: mode.colorBorder }]}>
                <Ionicons name={mode.icon} size={22} color={mode.color} />
              </View>
              <View style={s.bookTitles}>
                <Text style={[s.bookTitle, { color: mode.color }]}>{mode.title}</Text>
                <Text style={s.bookSubtitle}>{mode.subtitle}</Text>
              </View>
            </View>
            <Text style={s.bookDesc}>{mode.desc}</Text>
            <View style={s.bookFooter}>
              <Text style={[s.bookCta, { color: mode.color }]}>{mode.cta}</Text>
              <Ionicons name="arrow-forward" size={14} color={mode.color} />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.green },
  sub: { fontFamily: fonts.mono, fontSize: 14, color: colors.textFaint, letterSpacing: 3 },

  // Active ride card
  rideCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, margin: spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  rideCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  statusLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 2 },
  rideCardTitle: { fontFamily: fonts.mono, fontSize: 16, color: colors.textPrimary, letterSpacing: 0.5, marginBottom: spacing.sm },
  rideCardBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 22, marginBottom: spacing.lg },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.green,
    borderRadius: radius.pill, paddingVertical: 14,
  },
  ctaLabel: { fontFamily: fonts.mono, fontSize: 12, color: colors.bg, letterSpacing: 2 },

  // Booking hub
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.xl, paddingBottom: 48, gap: spacing.md },
  sectionLabel: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint,
    letterSpacing: 2, marginBottom: spacing.xs,
  },

  blastBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.greenDim, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.greenBorder,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  blastBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  blastDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green },
  blastBannerLabel: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.green, letterSpacing: 1.2 },
  blastBannerSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, marginTop: 1 },

  bookCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, overflow: 'hidden',
    flexDirection: 'row',
  },
  bookCardDisabled: { opacity: 0.55 },
  bookAccent: { width: 4 },
  bookBody: { flex: 1, padding: spacing.xl, gap: spacing.md },

  comingSoonPill: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  comingSoonText: {
    fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 1.5,
  },

  bookTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bookIconWrap: {
    width: 44, height: 44, borderRadius: radius.cardInner,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  bookTitles: { flex: 1 },
  bookTitle: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 1, lineHeight: 24 },
  bookSubtitle: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5 },

  bookDesc: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },

  bookFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bookCta: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5 },
});
