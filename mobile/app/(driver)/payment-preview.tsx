// Driver payment breakdown — "How does my pay work?"
// Enter a ride amount + extras → see exactly what gets collected, when, and how.
// Uses the shared fee calculator so numbers match the actual ride breakdown.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { calculateDriverPayout } from '@/shared/fee-calculator';

interface DriverPayProfile {
  tier: 'free' | 'hmu_first';
  completedRides: number;
  payout: { setupComplete: boolean; last4: string | null };
  accountCreatedAt?: string;
}

interface DepositConfig {
  depositMin: number;
  depositIncrement: number;
  depositMaxPctOfFare: number;
  feePercent: number;
  feeFloorCents: number;
}

const DEFAULT_DEPOSIT: DepositConfig = {
  depositMin: 5,
  depositIncrement: 5,
  depositMaxPctOfFare: 0.5,
  feePercent: 0.10,
  feeFloorCents: 100,
};

function calcDeposit(fare: number, cfg: DepositConfig): number {
  const pctBased = Math.round(fare * cfg.depositMaxPctOfFare / cfg.depositIncrement) * cfg.depositIncrement;
  const raw = Math.max(cfg.depositMin, pctBased);
  return Math.min(raw, fare); // deposit can't exceed fare
}

function Row({ label, value, accent, sub }: {
  label: string; value: string; accent?: boolean; sub?: string;
}) {
  return (
    <View style={r.row}>
      <View style={{ flex: 1 }}>
        <Text style={r.label}>{label}</Text>
        {sub && <Text style={r.sub}>{sub}</Text>}
      </View>
      <Text style={[r.value, accent && { color: colors.green }]}>{value}</Text>
    </View>
  );
}

const r = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  sub: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, marginTop: 2 },
  value: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textSecondary },
});

export default function PaymentPreview() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const [fareText, setFareText] = useState('25');
  const [extrasText, setExtrasText] = useState('0');
  const [profile, setProfile] = useState<DriverPayProfile | null>(null);
  const [depositCfg, setDepositCfg] = useState<DepositConfig>(DEFAULT_DEPOSIT);
  const [isDepositMode, setIsDepositMode] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const t = await getToken();
        const [p, modes] = await Promise.all([
          apiClient<DriverPayProfile>('/driver/profile', t),
          apiClient<{ modes: { modeKey: string; isDefaultGlobal: boolean; config: Record<string, unknown> | null }[] }>(
            '/admin/pricing-modes', t,
          ).catch(() => ({ modes: [] })),
        ]);
        setProfile(p);
        const active = modes.modes?.find(m => m.isDefaultGlobal);
        if (active) {
          setIsDepositMode(active.modeKey.includes('deposit'));
          if (active.config && active.modeKey.includes('deposit')) {
            const c = active.config as Record<string, number>;
            setDepositCfg({
              depositMin:          c.depositMin          ?? DEFAULT_DEPOSIT.depositMin,
              depositIncrement:    c.depositIncrement    ?? DEFAULT_DEPOSIT.depositIncrement,
              depositMaxPctOfFare: c.depositMaxPctOfFare ?? DEFAULT_DEPOSIT.depositMaxPctOfFare,
              feePercent:          c.feePercent          ?? DEFAULT_DEPOSIT.feePercent,
              feeFloorCents:       c.feeFloorCents       ?? DEFAULT_DEPOSIT.feeFloorCents,
            });
          }
        }
      } catch {}
    }
    void load();
  }, [getToken]);

  const fare   = Math.max(0, parseFloat(fareText)   || 0);
  const extras = Math.max(0, parseFloat(extrasText) || 0);
  const tier   = profile?.tier ?? 'free';

  // Full-fare mode: driver receives the standard payout breakdown
  const fullPayout = calculateDriverPayout(fare + extras, tier, 0, 0, 0);

  // Deposit mode: deposit is collected upfront, rest is cash at pickup
  const deposit         = isDepositMode ? calcDeposit(fare, depositCfg) : fare + extras;
  const depositStripeFee = Math.round((deposit * 0.029 + 0.30) * 100) / 100;
  const depositPlatform  = Math.round(deposit * depositCfg.feePercent * 100) / 100;
  const netDeposit       = Math.round((deposit - depositStripeFee - depositPlatform) * 100) / 100;
  const cashAtPickup     = isDepositMode ? Math.round((fare - deposit + extras) * 100) / 100 : 0;

  // Payout timing: Stripe standard is 2-day for established, 7-day rolling for new
  const completedRides    = profile?.completedRides ?? 0;
  const payoutSetup       = profile?.payout?.setupComplete ?? false;
  const isNewAccount      = completedRides < 10 || !payoutSetup;
  const clearingDays      = isNewAccount ? 7 : 2;
  const clearingLabel     = isNewAccount ? '7 business days' : '2 business days';

  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>HOW DO I GET PAID?</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Inputs */}
        <Animated.View entering={FadeIn.duration(400)} style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>ENTER A RIDE AMOUNT TO SEE YOUR BREAKDOWN</Text>
          <View style={s.inputRow}>
            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>RIDE FARE</Text>
              <View style={s.inputField}>
                <Text style={s.dollar}>$</Text>
                <TextInput
                  style={s.input}
                  value={fareText}
                  onChangeText={v => { setFareText(v.replace(/[^0-9.]/g, '')); void Haptics.selectionAsync(); }}
                  keyboardType="numeric"
                  placeholder="25"
                  placeholderTextColor={colors.textFaint}
                  selectTextOnFocus
                />
              </View>
            </View>
            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>EXTRAS / ADD-ONS</Text>
              <View style={s.inputField}>
                <Text style={s.dollar}>$</Text>
                <TextInput
                  style={s.input}
                  value={extrasText}
                  onChangeText={v => { setExtrasText(v.replace(/[^0-9.]/g, '')); void Haptics.selectionAsync(); }}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  selectTextOnFocus
                />
              </View>
            </View>
          </View>
        </Animated.View>

        {isDepositMode ? (
          <>
            {/* Deposit mode breakdown */}
            <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>AT BOOKING — RIDER PAYS DEPOSIT</Text>
              <Row label="Deposit collected"  value={fmt(deposit)} />
              <Row label="Stripe fee"         value={`- ${fmt(depositStripeFee)}`} sub="2.9% + $0.30" />
              <Row label="Platform fee"       value={`- ${fmt(depositPlatform)}`}  sub={`${(depositCfg.feePercent * 100).toFixed(0)}% of deposit`} />
              <Row label="You receive (deposit)"    value={fmt(netDeposit)} accent />
              <View style={s.timingPill}>
                <Ionicons name="time-outline" size={12} color={colors.amber} />
                <Text style={s.timingText}>
                  Clears to your bank in {clearingLabel}
                  {isNewAccount ? ' (new account)' : ''}
                </Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(180).duration(400)} style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>AT PICKUP — COLLECT FROM RIDER IN CASH</Text>
              <Row label="Ride fare"          value={fmt(fare)} />
              <Row label="Deposit (already paid)" value={`- ${fmt(deposit)}`} />
              {extras > 0 && <Row label="Extras" value={fmt(extras)} />}
              <Row label="Cash to collect"   value={fmt(cashAtPickup)} accent />
              <View style={s.timingPill}>
                <Ionicons name="cash-outline" size={12} color={colors.green} />
                <Text style={[s.timingText, { color: colors.green }]}>Collect this in cash when you pull up</Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(260).duration(400)} style={s.summaryCard}>
              <Text style={s.summaryLabel}>TOTAL EARNINGS THIS RIDE</Text>
              <Text style={s.summaryValue}>{fmt(netDeposit + cashAtPickup)}</Text>
              <Text style={s.summarySub}>
                {fmt(netDeposit)} via Stripe ({clearingLabel}) + {fmt(cashAtPickup)} cash at pickup
              </Text>
            </Animated.View>
          </>
        ) : (
          <>
            {/* Full fare mode breakdown */}
            <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>FULL FARE — RIDER PAYS TOTAL AT BOOKING</Text>
              <Row label="Total fare + extras" value={fmt(fare + extras)} />
              <Row label="Stripe fee"          value={`- ${fmt(fullPayout.stripeFee)}`}   sub="2.9% + $0.30" />
              <Row label="Platform fee"        value={`- ${fmt(fullPayout.platformFee)}`} sub={`${tier === 'hmu_first' ? '12' : '10'}% (${tier === 'hmu_first' ? 'HMU First' : 'Free tier'})`} />
              <Row label="You receive"         value={fmt(fullPayout.driverReceives)} accent />
              <View style={s.timingPill}>
                <Ionicons name="time-outline" size={12} color={colors.amber} />
                <Text style={s.timingText}>Clears to your bank in {clearingLabel}{isNewAccount ? ' (new account)' : ''}</Text>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(180).duration(400)} style={s.summaryCard}>
              <Text style={s.summaryLabel}>TOTAL EARNINGS THIS RIDE</Text>
              <Text style={s.summaryValue}>{fmt(fullPayout.driverReceives)}</Text>
              <Text style={s.summarySub}>Paid via Stripe in {clearingLabel}</Text>
            </Animated.View>
          </>
        )}

        {/* Payout context */}
        <Animated.View entering={FadeInUp.delay(340).duration(400)} style={[s.card, { borderColor: colors.border }]}>
          <Text style={s.cardLabel}>YOUR PAYOUT STATUS</Text>
          <Row
            label={payoutSetup ? 'Payout connected' : 'Payout not set up'}
            value={payoutSetup ? '✓' : '!'}
            accent={payoutSetup}
            sub={payoutSetup ? (profile?.payout?.last4 ? `••••${profile.payout.last4}` : 'Bank connected') : 'Set up payout to get paid'}
          />
          <Row
            label="Completed rides"
            value={String(completedRides)}
            sub={isNewAccount ? `${10 - completedRides} more to unlock 2-day payouts` : '2-day payouts unlocked'}
          />
          {!payoutSetup && (
            <TouchableOpacity
              style={[s.setupBtn]}
              onPress={() => router.push('/(driver)/payout-setup' as never)}
              activeOpacity={0.85}
            >
              <Text style={s.setupBtnText}>SET UP PAYOUT →</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 1.5 },

  content: { padding: spacing.xl, gap: spacing.lg },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.xs },

  inputRow: { flexDirection: 'row', gap: spacing.md },
  inputWrap: { flex: 1, gap: 6 },
  inputLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },
  inputField: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
  },
  dollar: { fontFamily: fonts.display, fontSize: 18, color: colors.textTertiary },
  input: {
    flex: 1, fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },

  timingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.amberBorder, marginTop: spacing.sm,
  },
  timingText: { fontFamily: fonts.mono, fontSize: 10, color: colors.amber, flex: 1 },

  summaryCard: {
    backgroundColor: colors.greenDim, borderRadius: radius.card,
    padding: spacing.xl, alignItems: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  summaryLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },
  summaryValue: { fontFamily: fonts.display, fontSize: 48, color: colors.green },
  summarySub: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, textAlign: 'center', lineHeight: 18 },

  setupBtn: {
    backgroundColor: colors.amber, borderRadius: radius.pill,
    paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm,
  },
  setupBtnText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.bg, letterSpacing: 1.5 },
});
