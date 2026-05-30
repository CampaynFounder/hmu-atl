import { useCallback, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
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

const BOOKING_MODES: BookingMode[] = [
  {
    type: 'direct',
    icon: 'person-circle-outline',
    color: colors.blue,
    colorDim: colors.blueDim,
    colorBorder: colors.blueBorder,
    title: 'DIRECT',
    subtitle: 'PULL UP ON YOUR DRIVER',
    desc: 'Book a specific driver by handle. They get 15 min to accept.',
    cta: 'PICK A DRIVER',
    delay: 0,
  },
  {
    type: 'blast',
    icon: 'radio-outline',
    color: colors.green,
    colorDim: colors.greenDim,
    colorBorder: colors.greenBorder,
    title: 'BLAST',
    subtitle: 'BROADCAST TO ALL',
    desc: 'Set your price. Drivers in your area HMU. Pick the best offer.',
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
    desc: 'Urgent pickup. Cash offer. First driver to pull up gets the job.',
    cta: "I'M GOOD FOR IT",
    delay: 160,
  },
  {
    type: 'delivery',
    icon: 'bag-handle-outline',
    color: colors.pink,
    colorDim: colors.pinkDim,
    colorBorder: colors.pinkBorder,
    title: 'REQUEST PICKUP',
    subtitle: 'GET ANYTHING DELIVERED',
    desc: 'Tell us what you need. A courier buys it and brings it to you.',
    cta: 'REQUEST ITEMS',
    delay: 240,
  },
];

export default function RiderHome() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [active, setActive] = useState<ActiveRide | null>(null);
  const [activeBlast, setActiveBlast] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);

  const checkActive = useCallback(async () => {
    try {
      const t = await getToken();
      const [ride, blast] = await Promise.allSettled([
        apiClient<ActiveRide>('/rides/active', t),
        apiClient<{ blast: { id: string } | null }>('/blast/active', t),
      ]);
      setActive(ride.status === 'fulfilled' ? ride.value : { hasActiveRide: false });
      setActiveBlast(blast.status === 'fulfilled' ? blast.value.blast : null);
    } catch {
      setActive({ hasActiveRide: false });
      setActiveBlast(null);
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

  const rideStatus = active?.status ?? '';
  const needsPullUp = active?.hasActiveRide && !active.isDriver && rideStatus === 'matched';
  const isOngoing = active?.hasActiveRide && !active.isDriver
    && ['otw', 'here', 'active', 'in_progress'].includes(rideStatus);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>HMU</Text>
        <Text style={s.sub}>ATL</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.green} style={{ marginTop: 60 }} />
      ) : needsPullUp ? (
        <Animated.View
          entering={FadeIn.duration(350)}
          style={[s.rideCard, shadow.card, { borderColor: colors.greenBorder, backgroundColor: colors.greenDim }]}
        >
          <View style={s.rideCardTop}>
            <View style={s.statusDot} />
            <Text style={[s.statusLabel, { color: colors.green }]}>DRIVER ACCEPTED</Text>
          </View>
          <Text style={s.rideCardTitle}>Enter your trip details</Text>
          <Text style={s.rideCardBody}>
            Your driver accepted. Share your exact pickup so they can navigate to you.
          </Text>
          <TouchableOpacity
            style={s.ctaBtn}
            onPress={() => router.push(`/(rider)/ride/pull-up?rideId=${active!.rideId}` as never)}
            activeOpacity={0.85}
          >
            <Ionicons name="location" size={14} color={colors.bg} />
            <Text style={s.ctaLabel}>SHARE MY LOCATION</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : isOngoing ? (
        <Animated.View entering={FadeIn.duration(350)} style={[s.rideCard, shadow.card]}>
          <View style={s.rideCardTop}>
            <View style={[s.statusDot, { backgroundColor: colors.blue }]} />
            <Text style={[s.statusLabel, { color: colors.blue }]}>
              {STATUS_LABEL[rideStatus] ?? rideStatus.toUpperCase()}
            </Text>
          </View>
          <Text style={s.rideCardTitle}>Ride in progress</Text>
          <TouchableOpacity
            style={[s.ctaBtn, { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }]}
            onPress={() => router.push(`/(rider)/ride/active?rideId=${active!.rideId}` as never)}
            activeOpacity={0.85}
          >
            <Ionicons name="car" size={14} color={colors.textPrimary} />
            <Text style={[s.ctaLabel, { color: colors.textPrimary }]}>VIEW RIDE</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeBlast && (
            <Animated.View entering={FadeIn.duration(350)}>
              <TouchableOpacity
                style={[s.blastBanner, shadow.card]}
                onPress={() => router.push('/(rider)/requests' as never)}
                activeOpacity={0.85}
              >
                <View style={s.blastBannerLeft}>
                  <View style={s.blastDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.blastBannerLabel}>ACTIVE BLAST</Text>
                    <Text style={s.blastBannerSub}>Tap to see offers & manage</Text>
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
                onPress={() => router.push(`/(rider)/book/${mode.type}` as never)}
              />
            ))}
          </PaymentGate>
        </ScrollView>
      )}
    </View>
  );
}

function BookingCard({ mode, onPress }: { mode: BookingMode; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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
  bookAccent: { width: 4 },
  bookBody: { flex: 1, padding: spacing.xl, gap: spacing.md },

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
