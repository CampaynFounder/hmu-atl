// Rider "driver passed" screen — RN parity of web driver-passed-client.tsx.
// Reached in real time when a driver passes on the rider's DIRECT booking: the
// notify channel sets declinedRequest, the waiting screen stops its countdown
// and routes here. Shows the driver's reason + note and the two next moves on
// the existing rails: HMU all drivers (broadcast-after-decline) or cancel
// (cancel-after-decline).

import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { useStableToken } from '@/hooks/use-stable-token';
import { apiClient } from '@/lib/api';
import { useNotifications } from '@/contexts/notifications';
import { loadPendingRideLocations, clearPendingRideLocations, type PendingRideLocations } from '@/lib/pending-ride-locations';

const REASON_LABEL: Record<string, string> = {
  price: 'Price was too low',
  distance: 'Too far / wrong way',
  booked: 'Schedule conflict',
  other: 'Other reason',
};

export default function DriverPassedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const getToken = useStableToken();
  const { postId: paramPostId } = useLocalSearchParams<{ postId?: string }>();
  const { declinedRequest, clearDeclinedRequest } = useNotifications();

  const [pendingLoc, setPendingLoc] = useState<PendingRideLocations | null>(null);
  const [busy, setBusy] = useState<'cancel' | 'broadcast' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadPendingRideLocations().then(setPendingLoc); }, []);

  const postId = declinedRequest?.postId ?? paramPostId ?? null;
  const driverName = declinedRequest?.driverName ?? 'The driver';
  const price = declinedRequest?.price ?? 0;
  const reason = declinedRequest?.reason ?? null;
  const message = declinedRequest?.message ?? null;

  const pickup = pendingLoc?.pickup?.address ?? null;
  const dropoff = pendingLoc?.dropoff?.address ?? null;

  // State-aware: this screen is a transient interstitial reached only when a
  // driver passes on a direct booking. If there's no passed request in context
  // or params (stale nav, back-stack, deep link), there's nothing to act on —
  // show a neutral empty state that routes the rider back into booking instead
  // of a broken "$0 / The driver passed" stub with dead buttons.
  if (!postId) {
    return (
      <View style={[s.root, { paddingTop: insets.top + spacing.xl }]}>
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}>
            <Ionicons name="checkmark-done" size={30} color={colors.green} />
          </View>
          <Text style={[s.title, { textAlign: 'center' }]}>You&apos;re all caught up</Text>
          <Text style={s.emptyBody}>
            No driver has passed on a request. Ready to ride?
          </Text>
        </View>
        <View style={[s.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
          <TouchableOpacity
            style={s.hmuBtn}
            onPress={() => router.replace('/(rider)/home' as never)}
            activeOpacity={0.85}
          >
            <Text style={s.hmuBtnText}>BOOK A RIDE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={() => router.replace('/(rider)/rides' as never)}
            activeOpacity={0.8}
          >
            <Text style={s.cancelBtnText}>Your Rides</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  async function act(kind: 'cancel' | 'broadcast') {
    if (!postId || busy) return;
    setBusy(kind);
    setError(null);
    try {
      const t = await getToken();
      const path = kind === 'broadcast'
        ? `/rider/posts/${postId}/broadcast-after-decline`
        : `/rider/posts/${postId}/cancel-after-decline`;
      await apiClient(path, t, { method: 'POST', body: JSON.stringify({}) });
      clearDeclinedRequest();
      if (kind === 'cancel') await clearPendingRideLocations().catch(() => {});
      router.replace('/(rider)/home' as never);
    } catch (e: any) {
      setError(e?.message ?? (kind === 'broadcast' ? 'Could not HMU' : 'Could not cancel'));
      setBusy(null);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + spacing.xl }]}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.emoji}>🤔</Text>
        <Text style={s.title}>{driverName} passed</Text>
        <Text style={s.subtitle}>HMU all active drivers, or cancel.</Text>

        {(reason || message) && (
          <View style={[s.card, shadow.card]}>
            {reason && (
              <View style={s.reasonPill}>
                <Text style={s.reasonPillText}>{REASON_LABEL[reason] ?? 'Other reason'}</Text>
              </View>
            )}
            {message && <Text style={s.message}>“{message}”</Text>}
          </View>
        )}

        <View style={[s.card, shadow.card]}>
          <DetailRow label="PICKUP" value={pickup ?? 'Not specified'} />
          <DetailRow label="DROPOFF" value={dropoff ?? 'Not specified'} />
          <View style={s.priceRow}>
            <Text style={s.detailLabel}>PRICE</Text>
            <Text style={s.priceValue}>${price}</Text>
          </View>
        </View>

        {error && (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={14} color={colors.red} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[s.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          style={[s.hmuBtn, busy && { opacity: 0.6 }]}
          onPress={() => act('broadcast')}
          disabled={!!busy}
          activeOpacity={0.85}
        >
          {busy === 'broadcast'
            ? <ActivityIndicator size="small" color={colors.bg} />
            : <Text style={s.hmuBtnText}>OTHER DRIVERS HMU · ${price}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.cancelBtn, busy && { opacity: 0.6 }]}
          onPress={() => act('cancel')}
          disabled={!!busy}
          activeOpacity={0.8}
        >
          {busy === 'cancel'
            ? <ActivityIndicator size="small" color={colors.textTertiary} />
            : <Text style={s.cancelBtnText}>Cancel Ride Request</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  emoji: { fontSize: 44, marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.textPrimary, lineHeight: 36 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  emptyBody: {
    fontFamily: fonts.body, fontSize: 15, color: colors.textTertiary,
    textAlign: 'center', lineHeight: 22, marginTop: spacing.sm,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, marginTop: 6, marginBottom: spacing.xl },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.lg, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  reasonPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.amberBorder,
  },
  reasonPillText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.amber, letterSpacing: 1 },
  message: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 21, marginTop: spacing.sm },

  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
  detailLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5 },
  detailValue: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, textAlign: 'right' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 },
  priceValue: { fontFamily: fonts.display, fontSize: 24, color: colors.green, lineHeight: 26 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder, marginTop: spacing.sm,
  },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.red, flex: 1 },

  actions: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  hmuBtn: { backgroundColor: colors.green, borderRadius: radius.pill, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  hmuBtnText: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.bg, letterSpacing: 0.5 },
  cancelBtn: { backgroundColor: 'transparent', borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong },
  cancelBtnText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textTertiary },
});
