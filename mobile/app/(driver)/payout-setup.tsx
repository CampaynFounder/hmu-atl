// Driver payout setup — Stripe Connect onboarding via account link.
//
// Flow:
//   1. GET /api/driver/payout-setup → check current status
//   2. POST /api/driver/stripe/onboarding-link → get account link URL
//   3. WebBrowser.openAuthSessionAsync(url, 'hmuatl://') → Stripe-hosted onboarding
//   4. Stripe redirects to hmuatl://payout-complete → OS returns control here
//   5. Refresh status
//
// Platform fee is set in admin → Pricing page (deposit-only: feePercent + feeFloorCents).
// Rider payment → platform (destination charge) → driver Connect account.
// application_fee_amount captured at Start Ride per captureRiderPayment() in lib/payments/escrow.ts.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useHmuFirst, formatPrice } from '@/hooks/use-hmu-first';

WebBrowser.maybeCompleteAuthSession();

interface PayoutStatus {
  stripeAccountId: string | null;
  stripeComplete: boolean;
  stripeAccount: {
    last4: string | null;
    type: string | null;
    bank: string | null;
    instantEligible: boolean;
  } | null;
  setupComplete: boolean;
  nextStep: 'stripe_onboarding' | 'add_payout_method' | 'complete';
}

export default function PayoutSetup() {
  const insets = useSafeAreaInsets();
  const getToken = useStableToken();
  const router = useRouter();

  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const hmuFirst = useHmuFirst();

  const fetchStatus = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<PayoutStatus>('/driver/payout-setup', t);
      setStatus(data);
    } catch { /* keep prior state */ }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  async function openOnboarding() {
    setOpening(true);
    try {
      const t = await getToken();
      const { url } = await apiClient<{ url: string }>('/driver/stripe/onboarding-link', t, { method: 'POST' });

      // openAuthSessionAsync waits for the OS to redirect back to hmuatl://
      // after Stripe onboarding completes. openBrowserAsync doesn't capture
      // the return redirect, so we use the auth-session variant here.
      const result = await WebBrowser.openAuthSessionAsync(url, 'hmuatl://');

      if (result.type === 'success' || result.type === 'dismiss') {
        // Refresh status regardless — Stripe may have updated the account
        setLoading(true);
        await fetchStatus();
      }
    } catch (e: any) {
      // user closed browser or network error — non-critical
      console.warn('[payout-setup] openOnboarding error:', e?.message);
    } finally {
      setOpening(false);
    }
  }

  async function openHmuFirstUpgrade() {
    await WebBrowser.openBrowserAsync('https://atl.hmucashride.com/driver/upgrade');
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Navbar */}
      <View style={s.nav}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.navTitle}>PAYOUT SETUP</Text>
        <View style={s.navSpacer} />
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Stripe Connect card */}
          <View style={[s.card, shadow.card]}>
            <Text style={s.sectionLabel}>STRIPE CONNECT</Text>
            <Text style={s.cardTitle}>Bank or Debit Card</Text>

            {status?.setupComplete ? (
              <>
                <View style={s.statusRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                  <Text style={s.statusGreen}>Payout account active</Text>
                </View>
                {status.stripeAccount && (
                  <View style={s.accountInfo}>
                    {status.stripeAccount.bank && (
                      <Text style={s.accountLine}>{status.stripeAccount.bank}</Text>
                    )}
                    {status.stripeAccount.last4 && (
                      <Text style={s.accountLine}>
                        {status.stripeAccount.type === 'card' ? 'Card' : 'Account'} ending ···{status.stripeAccount.last4}
                      </Text>
                    )}
                    {status.stripeAccount.instantEligible && (
                      <Text style={s.instantBadge}>Instant payout eligible</Text>
                    )}
                  </View>
                )}
                <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={openOnboarding} disabled={opening}>
                  {opening
                    ? <ActivityIndicator size="small" color={colors.green} />
                    : <Text style={s.btnSecondaryText}>UPDATE PAYOUT METHOD</Text>}
                </TouchableOpacity>
              </>
            ) : status?.nextStep === 'stripe_onboarding' || status?.nextStep === 'add_payout_method' ? (
              <>
                {status?.stripeComplete && !status?.setupComplete && (
                  <View style={s.statusRow}>
                    <Ionicons name="time-outline" size={16} color={colors.amber} />
                    <Text style={s.statusAmber}>Account under review — add a payout method</Text>
                  </View>
                )}
                <Text style={s.cardBody}>
                  Connect your bank or debit card to receive ride payouts directly.
                </Text>
                <TouchableOpacity style={s.btn} onPress={openOnboarding} disabled={opening}>
                  {opening
                    ? <ActivityIndicator color={colors.bg} />
                    : <Text style={s.btnText}>SET UP PAYOUTS</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.cardBody}>Loading…</Text>
            )}
          </View>

          {/* How it works */}
          <View style={[s.card, shadow.card]}>
            <Text style={s.sectionLabel}>HOW IT WORKS</Text>
            <Text style={s.cardTitle}>How Payments Work</Text>
            <View style={s.stepsList}>
              <PaymentStep
                n={1}
                text="We verify the rider has funds before they book you."
              />
              <PaymentStep
                n={2}
                text="Rider gets in your car and taps “I’m In” — the upfront funds transfer to your HMU Balance."
              />
              <PaymentStep
                n={3}
                text="The rider pays any remaining amount to you directly (Cash, Cash App, Apple Pay, etc.)."
              />
              <PaymentStep
                n={4}
                text="Once Stripe settles the funds, you can transfer your HMU Balance to your bank instantly."
              />
            </View>
            <View style={s.feeRow}>
              <Ionicons name="cash-outline" size={14} color={colors.textFaint} />
              <Text style={s.feeText}>Platform takes a small fee per ride. Admin-configurable.</Text>
            </View>
          </View>

          {/* HMU First upgrade — hidden entirely when a superadmin closes enrollment. */}
          {hmuFirst.enabled && (
            <View style={[s.card, shadow.card]}>
              <Text style={s.sectionLabel}>UPGRADE</Text>
              <Text style={s.cardTitle}>HMU First — {formatPrice(hmuFirst.priceCents)}/mo</Text>
              <Text style={s.cardBody}>
                Lower daily fee cap ($25) and instant payouts. Sign up on our website.
              </Text>
              <TouchableOpacity style={s.btnGold} onPress={openHmuFirstUpgrade}>
                <Text style={s.btnGoldText}>UPGRADE ON WEB</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.amber} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// Numbered step row for the "How Payments Work" explainer.
function PaymentStep({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.stepRow}>
      <View style={s.stepNum}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <Text style={s.stepText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  nav: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  navTitle: {
    flex: 1, textAlign: 'center', fontFamily: fonts.mono,
    fontSize: 13, color: colors.textPrimary, letterSpacing: 1.5,
  },
  navSpacer: { width: 30 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: 48 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.borderStrong,
  },
  sectionLabel: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint,
    letterSpacing: 2, marginBottom: spacing.xs,
  },
  cardTitle: {
    fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  cardBody: {
    fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary,
    lineHeight: 22, marginBottom: spacing.lg,
  },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  statusGreen: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.green },
  statusAmber: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.amber, flex: 1 },

  accountInfo: { marginBottom: spacing.lg, gap: 4 },
  accountLine: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },
  instantBadge: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.green,
    letterSpacing: 0.5, marginTop: 4,
  },

  stepsList: { gap: spacing.md, marginBottom: spacing.lg },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepNum: {
    width: 24, height: 24, borderRadius: 12, flexShrink: 0,
    backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  stepNumText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.green },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 21 },

  feeRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginTop: -spacing.xs,
  },
  feeText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, flex: 1 },

  btn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: 'center',
  },
  btnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1 },

  btnSecondary: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.greenBorder,
  },
  btnSecondaryText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.green, letterSpacing: 1 },

  btnGold: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.amberBorder, backgroundColor: colors.amberDim,
  },
  btnGoldText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.amber, letterSpacing: 1 },
});
