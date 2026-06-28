// Driver profile hub — identity card, stats, quick nav to sub-screens.
// Loads live data from GET /api/driver/profile.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useUserContext } from '@/contexts/UserContext';
import { AdminSheet } from '@/components/AdminSheet';

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

interface ActivationItem {
  key: string;
  label: string;
  cta: string;
  route: string;
  done: boolean;
}

interface ActivationProgress {
  items: ActivationItem[];
  complete: number;
  incomplete: number;
  total: number;
  percent: number;
}

// Maps the web routes returned by /api/driver/activation-progress to mobile screens.
const ACTIVATION_ROUTE_MAP: Record<string, string> = {
  '/driver/payout-setup': '/(driver)/payout-setup',
  '/driver/profile?focus=photo': '/(driver)/advanced/media',
  '/driver/profile?focus=video': '/(driver)/advanced/media',
  '/driver/profile?focus=pricing': '/(driver)/advanced/pricing',
  '/driver/schedule': '/(driver)/advanced/availability',
  '/driver/profile?focus=areas': '/(driver)/advanced/home-base',
  '/driver/profile?focus=vehicle': '/(driver)/edit-profile',
};

function toMobileRoute(webRoute: string): string {
  return ACTIVATION_ROUTE_MAP[webRoute] ?? '/(driver)/edit-profile';
}

export default function DriverProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const getToken = useStableToken();
  const router = useRouter();
  const { isSuperAdmin } = useUserContext();
  const [adminVisible, setAdminVisible] = useState(false);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [activation, setActivation] = useState<ActivationProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const t = await getToken();
      const [profileData, activationData] = await Promise.all([
        apiClient<DriverProfile>('/driver/profile', t),
        apiClient<ActivationProgress>('/driver/activation-progress', t),
      ]);
      setProfile(profileData);
      setActivation(activationData);
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

      {/* Identity card — long press opens super admin sheet */}
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={() => isSuperAdmin && setAdminVisible(true)}
        delayLongPress={600}
      >
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
        {isSuperAdmin && (
          <View style={s.superBadge}>
            <Text style={s.superBadgeText}>⚡ SUPER ADMIN</Text>
          </View>
        )}
      </View>
      </TouchableOpacity>
      <AdminSheet visible={adminVisible} onClose={() => setAdminVisible(false)} />

      {/* Stats */}
      <View style={s.statsRow}>
        <StatBox label="RIDES" value={String(completedRides)} />
        <StatBox label="CHILL" value={`${chillScore}%`} accent={chillScore >= 80} />
        <StatBox label="TIER" value={isFirst ? '1ST' : 'FREE'} accent={isFirst} />
      </View>

      {/* Activation checklist — shown until all items are done */}
      {activation && activation.incomplete > 0 && (
        <View style={[s.activationCard, shadow.card]}>
          <View style={s.activationHeader}>
            <Text style={s.sectionLabel}>ACTIVATION</Text>
            <View style={s.activationHeaderRight}>
              <Text style={s.activationCount}>{activation.complete}/{activation.total}</Text>
              <TouchableOpacity style={s.wizardBtn} onPress={() => router.push('/(driver)/onboarding' as any)}>
                <Text style={s.wizardBtnText}>START SETUP</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${activation.percent}%` as any }]} />
          </View>
          {activation.items.filter(i => !i.done).map((item) => (
            <TouchableOpacity
              key={item.key}
              style={s.activationRow}
              onPress={() => router.push(toMobileRoute(item.route) as any)}
              activeOpacity={0.7}
            >
              <View style={s.activationDot} />
              <Text style={s.activationLabel}>{item.label}</Text>
              <Text style={s.activationCta}>{item.cta}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
            </TouchableOpacity>
          ))}
        </View>
      )}

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
        <NavRow
          icon="cash-outline"
          label="How Do I Get Paid?"
          onPress={() => router.push('/(driver)/payment-preview' as never)}
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
  superBadge: {
    marginTop: spacing.sm, backgroundColor: colors.greenDim, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: colors.greenBorder,
  },
  superBadgeText: { fontFamily: fonts.mono, fontSize: 9, color: colors.green, letterSpacing: 1 },
  payoutWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm,
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.amberBorder,
  },
  payoutWarningText: { fontFamily: fonts.body, fontSize: 12, color: colors.amber, flex: 1 },

  activationCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.amberBorder,
    overflow: 'hidden',
  },
  activationHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  activationHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  activationCount: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber },
  wizardBtn: {
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.amberBorder,
  },
  wizardBtnText: { fontFamily: fonts.monoBold, fontSize: 9, color: colors.amber, letterSpacing: 1 },
  progressTrack: {
    height: 2, backgroundColor: colors.border,
    marginHorizontal: spacing.lg, marginBottom: spacing.xs, borderRadius: 1,
  },
  progressFill: { height: 2, backgroundColor: colors.amber, borderRadius: 1 },
  activationRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  activationDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.amber, opacity: 0.6,
  },
  activationLabel: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary },
  activationCta: { fontFamily: fonts.mono, fontSize: 10, color: colors.amber, letterSpacing: 0.5 },

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
