// Shown when the user's location maps to a market that is not yet live. Reached
// two ways: (1) at sign-up, BEFORE a Clerk session exists (gated by
// /public/market-check); (2) at launch, when an existing session's geo check
// fails (app/index.tsx). Their number is waitlisted server-side either way.
// The actions adapt to whether a session exists.

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';

export default function NotInMarketScreen() {
  const insets = useSafeAreaInsets();
  const { area, slug } = useLocalSearchParams<{ area: string; slug: string }>();
  const { isSignedIn, signOut } = useAuth();
  const router = useRouter();

  const displayArea = area && area !== 'Your area' ? area : 'Your city';

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <View style={s.content}>
        {/* Logo */}
        <Text style={s.logo}>HMU</Text>

        {/* City beacon */}
        <View style={s.beacon}>
          <Ionicons name="location-outline" size={32} color={colors.textFaint} />
        </View>

        <Text style={s.headline}>NOT IN {displayArea.toUpperCase()} YET</Text>
        <Text style={s.body}>
          HMU ATL is currently live in Atlanta, Georgia only. We&apos;re expanding fast — {displayArea} is on the map.
        </Text>

        <View style={s.divider} />

        <View style={s.waitlistCard}>
          <Ionicons name="checkmark-circle" size={16} color={colors.green} style={{ marginBottom: spacing.sm }} />
          <Text style={s.waitlistTitle}>YOU&apos;RE ON THE LIST</Text>
          <Text style={s.waitlistBody}>
            We saved your number. We&apos;ll text you the moment HMU goes live in {displayArea}.
          </Text>
        </View>
      </View>

      <View style={s.actions}>
        <TouchableOpacity
          style={s.retryBtn}
          onPress={() => router.replace(isSignedIn ? '/' : '/(auth)/sign-up')}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh-outline" size={14} color={colors.textSecondary} />
          <Text style={s.retryText}>CHECK AGAIN</Text>
        </TouchableOpacity>
        {isSignedIn ? (
          <TouchableOpacity
            style={s.signOutBtn}
            onPress={() => signOut()}
            activeOpacity={0.8}
          >
            <Text style={s.signOutText}>SIGN OUT</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.retryBtn}
            onPress={() => router.replace('/(auth)/sign-in')}
            activeOpacity={0.8}
          >
            <Text style={s.retryText}>ALREADY HAVE AN ACCOUNT? SIGN IN</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxl },

  logo: { fontFamily: fonts.display, fontSize: 52, color: colors.green, letterSpacing: 6, marginBottom: spacing.xxl },

  beacon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xl,
  },

  headline: { fontFamily: fonts.mono, fontSize: 13, color: colors.textSecondary, letterSpacing: 2, textAlign: 'center', marginBottom: spacing.md },

  body: { fontFamily: fonts.body, fontSize: 15, color: colors.textFaint, lineHeight: 24, textAlign: 'center' },

  divider: { height: 1, backgroundColor: colors.border, width: '100%', marginVertical: spacing.xxl },

  waitlistCard: {
    backgroundColor: colors.greenDim, borderRadius: radius.card, borderWidth: 1,
    borderColor: colors.greenBorder, padding: spacing.xl, alignItems: 'center', width: '100%',
  },
  waitlistTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.green, letterSpacing: 2, marginBottom: spacing.sm },
  waitlistBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center', lineHeight: 20 },

  actions: { paddingHorizontal: spacing.xxl, gap: spacing.sm },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.cardAlt, borderRadius: radius.pill,
    paddingVertical: 14, borderWidth: 1, borderColor: colors.border,
  },
  retryText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, letterSpacing: 1 },
  signOutBtn: {
    paddingVertical: 14, alignItems: 'center',
    backgroundColor: colors.redDim, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.redBorder,
  },
  signOutText: { fontFamily: fonts.mono, fontSize: 12, color: colors.red, letterSpacing: 1 },
});
