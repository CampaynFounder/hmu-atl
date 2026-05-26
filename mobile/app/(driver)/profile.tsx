import { useAuth, useUser } from '@clerk/clerk-expo';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';

export default function DriverProfile() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const handle = (user?.unsafeMetadata?.handle as string) ?? user?.fullName ?? 'Driver';
  const phone = user?.phoneNumbers?.[0]?.phoneNumber ?? '—';
  const tier = (user?.publicMetadata?.tier as string) ?? 'free';
  const completedRides = (user?.publicMetadata?.completedRides as number) ?? 0;
  const chillScore = (user?.publicMetadata?.chillScore as number) ?? 0;
  const isFirst = tier === 'hmu_first';

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.pageTitle}>PROFILE</Text>

      {/* Identity card */}
      <View style={[s.card, shadow.card]}>
        <View style={s.avatar}>
          <Text style={s.avatarLetter}>{handle[0]?.toUpperCase() ?? '?'}</Text>
        </View>
        <Text style={s.handle}>{handle}</Text>
        <View style={[s.tierBadge, isFirst ? s.tierBadgeFirst : s.tierBadgeFree]}>
          <Text style={[s.tierBadgeText, isFirst && { color: colors.bg }]}>
            {isFirst ? 'HMU FIRST' : 'FREE TIER'}
          </Text>
        </View>
        <Text style={s.phone}>{phone}</Text>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <StatBox label="RIDES" value={String(completedRides)} />
        <StatBox label="CHILL" value={`${Math.round(chillScore)}%`} />
        <StatBox label="TIER" value={isFirst ? '1ST' : 'FREE'} accent={isFirst} />
      </View>

      {/* Menu */}
      <View style={[s.menu, shadow.card]}>
        <Text style={s.menuSectionLabel}>ACCOUNT</Text>
        <MenuItem icon="create-outline" label="Edit Profile" onPress={() => {}} />
        <MenuItem icon="cash-outline" label="Payout Setup" onPress={() => router.push('/(driver)/payout-setup')} />
        <MenuItem icon="settings-outline" label="Settings" onPress={() => {}} />
        <MenuItem icon="help-circle-outline" label="Support" onPress={() => {}} />
      </View>

      <TouchableOpacity style={s.signOutBtn} onPress={() => signOut()}>
        <Text style={s.signOutText}>SIGN OUT</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[s.statBox, accent && s.statBoxAccent]}>
      <Text style={[s.statValue, accent && { color: colors.green }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.textTertiary} style={{ marginRight: spacing.md }} />
      <Text style={s.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: spacing.xxl, paddingBottom: 48 },

  pageTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.textPrimary, marginBottom: spacing.xl },

  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.xxl, alignItems: 'center', marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.borderStrong },
  avatarLetter: { fontFamily: fonts.display, fontSize: 36, color: colors.green },
  handle: { fontFamily: fonts.display, fontSize: 26, color: colors.textPrimary, marginBottom: spacing.xs },
  tierBadge: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginBottom: spacing.sm },
  tierBadgeFree: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  tierBadgeFirst: { backgroundColor: colors.green },
  tierBadgeText: { fontFamily: fonts.mono, fontSize: 10, fontWeight: '700', color: colors.textTertiary, letterSpacing: 1 },
  phone: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statBox: { flex: 1, backgroundColor: colors.card, borderRadius: radius.cardInner, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statBoxAccent: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, marginBottom: 2 },
  statLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },

  menu: { backgroundColor: colors.card, borderRadius: radius.card, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  menuSectionLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  menuLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },

  signOutBtn: { paddingVertical: 15, alignItems: 'center', backgroundColor: colors.redDim, borderRadius: radius.cardInner, borderWidth: 1, borderColor: colors.redBorder },
  signOutText: { fontFamily: fonts.mono, fontSize: 12, color: colors.red, letterSpacing: 1 },
});
