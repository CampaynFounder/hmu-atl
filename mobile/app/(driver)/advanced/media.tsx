// Media & Video — intro video, Vibe selfie, cover photo.
// Upload requires a camera/file picker + multipart upload to /api/upload/video.
// For now this screen explains the feature and links to the web profile for upload.
// The upload UI will be built once the native camera permissions flow is wired.

import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';

const MEDIA_TYPES = [
  {
    icon: 'videocam' as const,
    color: colors.blue,
    bg: colors.blueDim,
    label: 'Intro Video',
    sub: 'Plays on your public HMU link. Show off your vibe, your car, your style.',
  },
  {
    icon: 'sparkles' as const,
    color: colors.amber,
    bg: colors.amberDim,
    label: 'Vibe on File',
    sub: 'A 6-second selfie reel. Earns you a Vibe badge on your profile.',
  },
  {
    icon: 'image' as const,
    color: colors.pink,
    bg: colors.pinkDim,
    label: 'Cover Photo / Ad',
    sub: 'Shown on your HMU link. Use your vehicle, a promo, or an ad.',
  },
];

export default function MediaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>MEDIA & VIDEO</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.card, shadow.card]}>
          {MEDIA_TYPES.map((item, i) => (
            <View key={item.label}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.row}>
                <View style={[s.iconWrap, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={s.rowText}>
                  <Text style={s.rowLabel}>{item.label}</Text>
                  <Text style={s.rowSub}>{item.sub}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={s.ctaCard}>
          <Ionicons name="phone-portrait-outline" size={24} color={colors.textFaint} style={{ marginBottom: spacing.md }} />
          <Text style={s.ctaTitle}>UPLOAD FROM THE WEB</Text>
          <Text style={s.ctaBody}>
            Video uploads, camera recording, and the Vibe selfie tool are available at{' '}
            <Text style={s.ctaLink}>atl.hmucashride.com/driver/profile</Text>
            {'\n\n'}
            Native camera upload is coming to the app soon.
          </Text>
          <TouchableOpacity
            style={s.webBtn}
            onPress={() => Linking.openURL('https://atl.hmucashride.com/driver/profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="open-outline" size={14} color="#000" />
            <Text style={s.webBtnText}>OPEN WEB PROFILE</Text>
          </TouchableOpacity>
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
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, gap: spacing.md,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: radius.cardInner,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
  },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2, lineHeight: 18 },
  ctaCard: {
    marginTop: spacing.xl, padding: spacing.xl,
    backgroundColor: colors.cardAlt, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center',
  },
  ctaTitle: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.sm },
  ctaBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 20, textAlign: 'center', marginBottom: spacing.xl },
  ctaLink: { color: colors.green },
  webBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.green, borderRadius: radius.cardInner,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  webBtnText: { fontFamily: fonts.mono, fontSize: 11, color: '#000', letterSpacing: 1 },
});
