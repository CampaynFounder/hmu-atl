import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { colors, fonts, radius, spacing } from '@/lib/theme';

const BOOKING_META: Record<string, {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  colorDim: string;
  colorBorder: string;
  title: string;
  subtitle: string;
  desc: string;
}> = {
  direct: {
    icon: 'person-circle-outline',
    color: colors.blue,
    colorDim: colors.blueDim,
    colorBorder: colors.blueBorder,
    title: 'DIRECT BOOKING',
    subtitle: 'PULL UP ON YOUR DRIVER',
    desc: 'Search by handle or browse drivers you\'ve ridden with. They have 15 minutes to accept.',
  },
  blast: {
    icon: 'radio-outline',
    color: colors.green,
    colorDim: colors.greenDim,
    colorBorder: colors.greenBorder,
    title: 'BLAST',
    subtitle: 'BROADCAST TO ALL DRIVERS',
    desc: 'Set your price. Drivers in your area see your request and HMU. You pick the best offer.',
  },
  'down-bad': {
    icon: 'flash-outline',
    color: colors.amber,
    colorDim: colors.amberDim,
    colorBorder: colors.amberBorder,
    title: 'DOWN BAD',
    subtitle: 'FIRST DRIVER WINS',
    desc: 'Urgent pickup. Post a cash offer and the first driver to pull up gets the job. No waiting around.',
  },
};

export default function BookingFormStub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: string }>();

  const meta = BOOKING_META[type ?? ''] ?? BOOKING_META.blast;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{meta.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.content}>
        <Animated.View
          entering={FadeIn.duration(400)}
          style={[s.iconWrap, { backgroundColor: meta.colorDim, borderColor: meta.colorBorder }]}
        >
          <Ionicons name={meta.icon} size={44} color={meta.color} />
        </Animated.View>

        <Animated.Text entering={FadeInUp.delay(100).duration(400)} style={[s.subtitle, { color: meta.color }]}>
          {meta.subtitle}
        </Animated.Text>

        <Animated.Text entering={FadeInUp.delay(200).duration(400)} style={s.desc}>
          {meta.desc}
        </Animated.Text>

        <Animated.View entering={FadeInUp.delay(350).duration(400)} style={[s.badge, { borderColor: meta.colorBorder, backgroundColor: meta.colorDim }]}>
          <Ionicons name="construct-outline" size={13} color={meta.color} />
          <Text style={[s.badgeText, { color: meta.color }]}>BOOKING FORM COMING NEXT BUILD</Text>
        </Animated.View>
      </View>
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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, letterSpacing: 1 },

  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.lg,
  },

  iconWrap: {
    width: 96, height: 96, borderRadius: radius.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    marginBottom: spacing.sm,
  },

  subtitle: { fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 2, textAlign: 'center' },
  desc: {
    fontFamily: fonts.body, fontSize: 15, color: colors.textTertiary,
    textAlign: 'center', lineHeight: 22,
  },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8,
    borderWidth: 1, marginTop: spacing.sm,
  },
  badgeText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1 },
});
