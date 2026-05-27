// Advanced Settings shell — drill-down list of advanced driver config categories.
// Each row pushes to a focused sub-screen. All APIs already exist on the server.

import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';

interface DrillRow {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
  label: string;
  sub: string;
  route: string;
}

const ROWS: DrillRow[] = [
  {
    icon: 'shield-checkmark',
    iconColor: colors.blue,
    iconBg: colors.blueDim,
    label: 'Rider Quality Gates',
    sub: 'Min Chill Score, OG Only, Advance Notice',
    route: '/(driver)/advanced/rider-quality',
  },
  {
    icon: 'pricetag',
    iconColor: colors.green,
    iconBg: colors.greenDim,
    label: 'Pricing & Rates',
    sub: 'Minimum ride, base rate, hourly, deposit floor',
    route: '/(driver)/advanced/pricing',
  },
  {
    icon: 'flame',
    iconColor: colors.red,
    iconBg: colors.redDim,
    label: 'Down Bad',
    sub: 'Opt in to receive Down Bad requests',
    route: '/(driver)/advanced/down-bad',
  },
  {
    icon: 'calendar',
    iconColor: colors.amber,
    iconBg: colors.amberDim,
    label: 'Availability Schedule',
    sub: 'Set which days you drive',
    route: '/(driver)/advanced/availability',
  },
  {
    icon: 'home',
    iconColor: colors.pink,
    iconBg: colors.pinkDim,
    label: 'Home Base',
    sub: 'Shown to riders when you\'re offline',
    route: '/(driver)/advanced/home-base',
  },
  {
    icon: 'camera',
    iconColor: colors.textSecondary,
    iconBg: 'rgba(255,255,255,0.04)',
    label: 'Media & Video',
    sub: 'Intro video, Vibe selfie, Cover photo',
    route: '/(driver)/advanced/media',
  },
];

export default function AdvancedSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>ADVANCED SETTINGS</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.hint}>
          These settings are for drivers who want more control. Most drivers won't need to change anything here.
        </Text>

        <View style={[s.card, shadow.card]}>
          {ROWS.map((row, i) => (
            <View key={row.route}>
              {i > 0 && <View style={s.divider} />}
              <TouchableOpacity
                style={s.row}
                onPress={() => router.push(row.route as never)}
                activeOpacity={0.7}
              >
                <View style={[s.iconWrap, { backgroundColor: row.iconBg }]}>
                  <Ionicons name={row.icon} size={18} color={row.iconColor} />
                </View>
                <View style={s.rowText}>
                  <Text style={s.rowLabel}>{row.label}</Text>
                  <Text style={s.rowSub}>{row.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  hint: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textFaint,
    marginBottom: spacing.xl, lineHeight: 20,
  },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: radius.cardInner,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
});
