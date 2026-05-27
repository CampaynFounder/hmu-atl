// Driver profile hub — identity card, stats, quick nav to sub-screens.
// Loads live data from GET /api/driver/profile.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface DriverProfile {
  id: string;
  handle: string;
  displayName: string;
  phone: string | null;
  vehicleInfo: { licensePlate: string; plateState: string; photoUrl: string | null };
  areaSlugs: string[];
  servicesEntireMarket: boolean;
  acceptsCash: boolean;
  waitMinutes: number;
  acceptsDownBad: boolean;
  tier: string;
  chillScore: number;
  completedRides: number;
  payout: { setupComplete: boolean; last4: string | null; bankName: string | null };
}

export default function DriverProfileScreen() {
  const insets = useSafeAreaInsets();
  const { getToken, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<DriverProfile>('/driver/profile', t);
      setProfile(data);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [getToken]);

  useEffect(() => { void fetchProfile(); }, [fetchProfile]);

  const onRefresh = useCallback(() => { setRefreshing(true); void fetchProfile(); }, [fetchProfile]);

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const handle = profile?.handle ?? 'driver';
  const isFirst = profile?.tier === 'hmu_first';
  const chillScore = Math.round(profile?.chillScore ?? 0);
  const completedRides = profile?.completedRides ?? 0;
  const payoutDone = profile?.payout?.setupComplete ?? false;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />}
    >
      <Text style={s.pageTitle}>PROFILE</Text>

      {/* Identity card */}
      <View style={[s.card, shadow.card]}>
        <View style={s.avatarWrap}>
          {profile?.vehicleInfo?.photoUrl ? (
            <Image source={{ uri: profile.vehicleInfo.photoUrl }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarLetter}>{handle[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          )}
        </View>
        <Text style={s.handle}>@{handle}</Text>
        {profile?.displayName && profile.displayName !== handle && (
          <Text style={s.displayName}>{profile.displayName}</Text>
        )}
        <View style={[s.tierBadge, isFirst ? s.tierFirst : s.tierFree]}>
          <Text style={[s.tierText, isFirst && { color: colors.bg }]}>
            {isFirst ? 'HMU FIRST' : 'FREE TIER'}
          </Text>
        </View>
        {!payoutDone && (
          <TouchableOpacity
            style={s.payoutWarning}
            onPress={() => router.push('/(driver)/payout-setup' as any)}
          >
            <Ionicons name="alert-circle" size={13} color={colors.amber} />
            <Text style={s.payoutWarningText}>Payout setup required to drive</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.amber} />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        <StatBox label="RIDES" value={String(completedRides)} />
        <StatBox label="CHILL" value={`${chillScore}%`} accent={chillScore >= 80} />
        <StatBox label="TIER" value={isFirst ? '1ST' : 'FREE'} accent={isFirst} />
      </View>

      {/* Account nav */}
      <View style={[s.menu, shadow.card]}>
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <NavRow icon="create-outline" label="Edit Profile" onPress={() => router.push('/(driver)/edit-profile' as any)} />
        <NavRow icon="restaurant-outline" label="Service Menu" onPress={() => router.push('/(driver)/menu' as any)} />
        <NavRow
          icon="card-outline"
          label="Payout Setup"
          badge={!payoutDone ? '!' : undefined}
          onPress={() => router.push('/(driver)/payout-setup' as any)}
        />
        <NavRow icon="help-circle-outline" label="Support" onPress={() => router.push('/(driver)/support' as any)} last />
      </View>

      <TouchableOpacity style={s.signOutBtn} onPress={() => signOut()}>
        <Text style={s.signOutText}>SIGN OUT</Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
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

function NavRow({
  icon, label, badge, onPress, last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  badge?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity style={[s.navRow, last && s.navRowLast]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={colors.textTertiary} />
      <Text style={s.navLabel}>{label}</Text>
      {badge && (
        <View style={s.navBadge}>
          <Text style={s.navBadgeText}>{badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={{ marginLeft: 'auto' }} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: 56 },
  loader: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  pageTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.textPrimary, marginBottom: spacing.xl },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xxl, alignItems: 'center',
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong,
  },
  avatarWrap: { marginBottom: spacing.md },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarFallback: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  avatarLetter: { fontFamily: fonts.display, fontSize: 38, color: colors.green },
  handle: { fontFamily: fonts.display, fontSize: 26, color: colors.textPrimary, marginBottom: spacing.xs },
  displayName: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, marginBottom: spacing.xs },
  tierBadge: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginBottom: spacing.sm },
  tierFree: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  tierFirst: { backgroundColor: colors.green },
  tierText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },
  payoutWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm,
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.amberBorder,
  },
  payoutWarningText: { fontFamily: fonts.body, fontSize: 12, color: colors.amber, flex: 1 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statBox: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.cardInner,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  statBoxAccent: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, marginBottom: 2 },
  statLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },

  menu: {
    backgroundColor: colors.card, borderRadius: radius.card,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  sectionLabel: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  navRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  navRowLast: {},
  navLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  navBadge: {
    backgroundColor: colors.amber, borderRadius: radius.pill,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  navBadgeText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.bg },

  signOutBtn: {
    paddingVertical: 15, alignItems: 'center',
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.redBorder,
  },
  signOutText: { fontFamily: fonts.mono, fontSize: 12, color: colors.red, letterSpacing: 1 },
});
