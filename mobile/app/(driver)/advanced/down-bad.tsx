// Down Bad opt-in screen.
// GET /api/driver/down-bad-toggle → { acceptsDownBad, hasPaymentMethod, disclaimerText }
// PATCH /api/driver/down-bad-toggle { accepts: boolean }

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, Modal, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow, toggle } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface DownBadState {
  acceptsDownBad: boolean;
  hasPaymentMethod: boolean;
  disclaimerText: string;
}

export default function DownBadScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<DownBadState>({ acceptsDownBad: false, hasPaymentMethod: false, disclaimerText: '' });
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        const d = await apiClient<DownBadState>('/driver/down-bad-toggle', t);
        setData(d);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [getToken]);

  function handleToggle(val: boolean) {
    if (!data.hasPaymentMethod && val) {
      setError('Complete payout setup before enabling Down Bad.');
      return;
    }
    if (val) {
      setShowDisclaimer(true);
    } else {
      void confirmToggle(false);
    }
  }

  async function confirmToggle(val: boolean) {
    setShowDisclaimer(false);
    setSaving(true);
    setError(null);
    try {
      const t = await getToken();
      await apiClient('/driver/down-bad-toggle', t, {
        method: 'PATCH',
        body: JSON.stringify({ accepts: val }),
      });
      setData((d) => ({ ...d, acceptsDownBad: val }));
      Haptics.notificationAsync(val ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const enabled = data.acceptsDownBad;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>DOWN BAD</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <View style={[s.banner, enabled ? s.bannerOn : s.bannerOff]}>
          <Ionicons name="flame" size={20} color={enabled ? colors.red : colors.textFaint} />
          <Text style={[s.bannerText, enabled ? s.bannerTextOn : s.bannerTextOff]}>
            {enabled ? 'You\'re opted in to Down Bad requests' : 'You\'re not receiving Down Bad requests'}
          </Text>
        </View>

        <View style={[s.card, shadow.card]}>
          <View style={s.toggleRow}>
            <View style={s.toggleLabelCol}>
              <Text style={s.toggleLabel}>Accept Down Bad</Text>
              <Text style={s.toggleSub}>
                {data.hasPaymentMethod
                  ? 'Riders can send you Down Bad requests'
                  : 'Complete payout setup to enable'}
              </Text>
            </View>
            {saving
              ? <ActivityIndicator size="small" color={colors.green} />
              : (
                <Switch
                  value={enabled}
                  onValueChange={handleToggle}
                  disabled={saving}
                  trackColor={{ false: toggle.trackOff, true: toggle.red.trackOn }}
                  thumbColor={enabled ? toggle.red.thumbOn : toggle.thumbOff}
                  ios_backgroundColor={toggle.trackOff}
                />
              )}
          </View>
        </View>

        {/* Safety disclaimer — always visible so drivers weigh the risk before
            and after opting in, not only inside the one-time opt-in modal. */}
        <View style={s.safetyCard}>
          <View style={s.safetyHeader}>
            <Ionicons name="shield-half" size={15} color={colors.amber} />
            <Text style={s.safetyTitle}>STAY SAFE</Text>
          </View>
          <Text style={s.safetyBody}>
            Down Bad requests are urgent and can come from riders you don't know.
            Trust your gut — you're never obligated to accept. Meet in public, keep
            the ride in the app, and never run a favor that feels unsafe or illegal.
            Report anything sketchy in Support.
          </Text>
        </View>

        {!data.hasPaymentMethod && (
          <TouchableOpacity style={s.payoutCta} onPress={() => router.push('/(driver)/payout-setup')} activeOpacity={0.8}>
            <Ionicons name="card" size={16} color={colors.amber} />
            <Text style={s.payoutCtaText}>Set up payout to enable Down Bad</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.amber} />
          </TouchableOpacity>
        )}

        {error && <Text style={s.errorText}>{error}</Text>}

        <View style={s.infoCard}>
          <Text style={s.infoTitle}>WHAT IS DOWN BAD?</Text>
          <Text style={s.infoBody}>
            Riders post urgent requests with a cash deposit and a favor ("sum extra"). You swipe on them like a deck — accept the ones that work for you. Platform takes a small facilitation fee from the deposit.
          </Text>
        </View>
      </ScrollView>

      {/* Disclaimer modal */}
      <Modal visible={showDisclaimer} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { paddingBottom: insets.bottom + spacing.xl }]}>
            <Text style={s.modalTitle}>BEFORE YOU OPT IN</Text>
            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={s.modalBody}>
                {data.disclaimerText || 'By opting in, you agree to review Down Bad requests and respond professionally. HMU takes a facilitation fee from the deposit. All platform rules apply.'}
              </Text>
            </ScrollView>
            <TouchableOpacity style={s.confirmBtn} onPress={() => confirmToggle(true)} activeOpacity={0.8}>
              <Text style={s.confirmText}>I&apos;M DOWN — OPT IN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowDisclaimer(false)} activeOpacity={0.7}>
              <Text style={s.cancelText}>NEVER MIND</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
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
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.cardInner,
    borderWidth: 1, marginBottom: spacing.lg,
  },
  bannerOn: { backgroundColor: colors.redDim, borderColor: colors.redBorder },
  bannerOff: { backgroundColor: colors.cardAlt, borderColor: colors.border },
  bannerText: { fontFamily: fonts.bodyMedium, fontSize: 14, flex: 1 },
  bannerTextOn: { color: colors.red },
  bannerTextOff: { color: colors.textFaint },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  toggleLabelCol: { flex: 1, marginRight: spacing.lg },
  toggleLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  toggleSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  payoutCta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.md, padding: spacing.md,
    backgroundColor: colors.amberDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.amberBorder,
  },
  payoutCtaText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.amber, flex: 1 },
  safetyCard: {
    marginTop: spacing.md, padding: spacing.lg,
    backgroundColor: colors.amberDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.amberBorder,
  },
  safetyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  safetyTitle: { fontFamily: fonts.mono, fontSize: 10, color: colors.amber, letterSpacing: 2 },
  safetyBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.red, marginTop: spacing.md },
  infoCard: {
    marginTop: spacing.xl, padding: spacing.lg,
    backgroundColor: colors.cardAlt, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border,
  },
  infoTitle: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.sm },
  infoBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: colors.border, padding: spacing.xl,
    maxHeight: '70%',
  },
  modalTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.lg },
  modalScroll: { maxHeight: 200, marginBottom: spacing.xl },
  modalBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  confirmBtn: {
    backgroundColor: colors.red, borderRadius: radius.cardInner,
    padding: spacing.md, alignItems: 'center', marginBottom: spacing.sm,
  },
  confirmText: { fontFamily: fonts.mono, fontSize: 12, color: '#fff', letterSpacing: 1 },
  cancelBtn: { padding: spacing.md, alignItems: 'center' },
  cancelText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1 },
});
