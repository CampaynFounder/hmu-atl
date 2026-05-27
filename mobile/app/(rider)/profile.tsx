// Rider profile hub — identity card, stats, account nav.
// Loads from GET /api/rider/profile (handle/gender) + GET /api/rides/history (stats).

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface RiderProfile {
  handle: string | null;
  gender: string | null;
}

interface RideSummary {
  id: string;
  status: string;
  driver_rating: string | null;
}

export default function RiderProfileScreen() {
  const insets = useSafeAreaInsets();
  const { getToken, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [rides, setRides] = useState<RideSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const t = await getToken();
      const [p, r] = await Promise.all([
        apiClient<RiderProfile>('/rider/profile', t),
        apiClient<{ rides: RideSummary[] }>('/rides/history', t),
      ]);
      setProfile(p);
      setRides(r.rides ?? []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [getToken]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const onRefresh = useCallback(() => { setRefreshing(true); void fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const handle = profile?.handle ?? 'rider';
  const completedRides = rides.filter(r => r.status === 'completed').length;
  const pendingRatings = rides.filter(r => r.status === 'ended' && r.driver_rating == null).length;

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
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarLetter}>{handle[0]?.toUpperCase() ?? '?'}</Text>
            </View>
          </View>
          <Text style={s.handle}>@{handle}</Text>
          <View style={[s.tierBadge]}>
            <Text style={s.tierText}>RIDER</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <StatBox label="RIDES" value={String(completedRides)} />
          <StatBox
            label="RATE"
            value={pendingRatings > 0 ? `${pendingRatings} DUE` : 'ALL DONE'}
            accent={pendingRatings === 0}
          />
        </View>

        {/* Pending ratings prompt */}
        {pendingRatings > 0 && (
          <TouchableOpacity
            style={s.ratePrompt}
            onPress={() => router.push('/(rider)/rides' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="star-outline" size={14} color={colors.amber} />
            <Text style={s.ratePromptText}>
              {pendingRatings} ride{pendingRatings > 1 ? 's' : ''} waiting for your rating
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.amber} />
          </TouchableOpacity>
        )}

        {/* Account nav */}
        <View style={[s.menu, shadow.card]}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <NavRow
            icon="car-outline"
            label="My Rides"
            onPress={() => router.push('/(rider)/rides' as any)}
          />
          <NavRow icon="help-circle-outline" label="Support" onPress={() => router.push('/(rider)/support' as any)} last />
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
  avatarFallback: {
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  avatarLetter: { fontFamily: fonts.display, fontSize: 38, color: colors.green },
  handle: { fontFamily: fonts.display, fontSize: 26, color: colors.textPrimary, marginBottom: spacing.xs },
  tierBadge: {
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  tierText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 1 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statBox: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.cardInner,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  statBoxAccent: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, marginBottom: 2 },
  statLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },

  ratePrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.amberBorder, marginBottom: spacing.lg,
  },
  ratePromptText: { fontFamily: fonts.body, fontSize: 13, color: colors.amber, flex: 1 },

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
