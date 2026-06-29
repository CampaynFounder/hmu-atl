// Driver payment breakdown — "How does my pay work?"
// Shows a mode-aware guarantee banner, exact deposit available date,
// cash to collect at pickup, and Stripe history progress.

import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { calculateDriverPayout } from '@/shared/fee-calculator';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DriverPayProfile {
  tier: 'free' | 'hmu_first';
  completedRides: number;
  payout: { setupComplete: boolean; last4: string | null };
}

interface DepositConfig {
  depositMin: number;
  depositIncrement: number;
  depositMaxPctOfFare: number;
  feePercent: number;
  feeFloorCents: number;
}

const DEFAULT_DEPOSIT: DepositConfig = {
  depositMin: 5, depositIncrement: 5, depositMaxPctOfFare: 0.5,
  feePercent: 0.10, feeFloorCents: 100,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Canonical payout breakdown, computed server-side from the live config so this
// calculator can never drift from what's actually captured (see
// /api/driver/payout-preview). Replaces the old local deposit math, which
// rounded the deposit past the 50% cap and wrongly charged the driver the Stripe
// fee in 'platform' bearer mode.
interface PayoutPreview {
  fare: number;
  deposit: number;
  cashAtPickup: number;
  driverViaStripe: number;
  hmuFee: number;
  stripeFee: number;
  stripeBearer: 'platform' | 'driver';
  extras: { amount: number; hmuFee: number; stripeFee: number; driverViaStripe: number };
  totalEarned: number;
}

/** Returns "Available by Mon, Jun 4" based on today + clearing window */
function availableDate(clearingDays: number): string {
  const d = new Date();
  // Add calendar days (Stripe counts calendar days not business days)
  d.setDate(d.getDate() + clearingDays);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;

// ── Breakdown row ─────────────────────────────────────────────────────────────

function Row({ label, value, accent, sub, dim }: {
  label: string; value: string; accent?: boolean; sub?: string; dim?: boolean;
}) {
  return (
    <View style={r.row}>
      <View style={{ flex: 1 }}>
        <Text style={[r.label, dim && { color: colors.textFaint }]}>{label}</Text>
        {sub && <Text style={r.sub}>{sub}</Text>}
      </View>
      <Text style={[r.value, accent && { color: colors.green }, dim && { color: colors.textFaint }]}>
        {value}
      </Text>
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
  sub:   { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, marginTop: 2 },
  value: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textSecondary },
});

// ── Guarantee banner ──────────────────────────────────────────────────────────

function GuaranteeBanner({ isDepositMode }: { isDepositMode: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const accentColor  = isDepositMode ? colors.red : colors.green;
  const dimColor     = isDepositMode ? colors.redDim : colors.greenDim;
  const borderColor  = isDepositMode ? colors.redBorder : colors.greenBorder;
  const icon: React.ComponentProps<typeof Ionicons>['name'] = isDepositMode ? 'shield-checkmark' : 'lock-closed';

  const headline = isDepositMode
    ? 'DEPOSIT PROTECTED'
    : 'FULL PAYMENT PROTECTED';

  const shortLine = isDepositMode
    ? 'Deposit guaranteed before you pull up. Collect the rest in cash.'
    : 'Full fare guaranteed before you pull up. Nothing to collect.';

  return (
    <>
      <TouchableOpacity
        style={[gb.banner, { backgroundColor: dimColor, borderColor }]}
        onPress={() => { setExpanded(true); void Haptics.selectionAsync(); }}
        activeOpacity={0.85}
      >
        <View style={[gb.iconWrap, { backgroundColor: dimColor, borderColor }]}>
          <Ionicons name={icon} size={18} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[gb.headline, { color: accentColor }]}>{headline}</Text>
          <Text style={gb.short}>{shortLine}</Text>
        </View>
        <Ionicons name="information-circle-outline" size={16} color={accentColor} />
      </TouchableOpacity>

      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        <TouchableOpacity style={gb.overlay} activeOpacity={1} onPress={() => setExpanded(false)}>
          <View style={gb.sheet}>
            <View style={[gb.sheetHeader, { borderBottomColor: borderColor }]}>
              <Ionicons name={icon} size={24} color={accentColor} />
              <Text style={[gb.sheetTitle, { color: accentColor }]}>{headline}</Text>
            </View>

            {isDepositMode ? (
              <View style={gb.body}>
                <Text style={gb.para}>
                  Before you start driving, the rider pays a <Text style={gb.bold}>deposit</Text> through
                  the app. We hold that deposit until pickup — so you know the rider is committed before you leave.
                </Text>
                <Text style={gb.para}>
                  When you arrive, you collect the <Text style={gb.bold}>remaining fare in cash</Text> directly
                  from the rider. No more ghosts when you're 2 minutes away.
                </Text>
                <View style={gb.whyCard}>
                  <Text style={gb.whyTitle}>WHY WE DO IT THIS WAY</Text>
                  <View style={gb.whyRow}>
                    <Text style={gb.bullet}>①</Text>
                    <Text style={gb.whyText}>You earn cash <Text style={gb.bold}>immediately</Text> at pickup — no waiting on Stripe for the full fare.</Text>
                  </View>
                  <View style={gb.whyRow}>
                    <Text style={gb.bullet}>②</Text>
                    <Text style={gb.whyText}>Every deposit builds your <Text style={gb.bold}>Stripe history</Text> — the more rides you do, the faster your deposits clear.</Text>
                  </View>
                  <View style={gb.whyRow}>
                    <Text style={gb.bullet}>③</Text>
                    <Text style={gb.whyText}>Riders can't ghost you. Money is already in escrow before you pull out of your driveway.</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={gb.body}>
                <Text style={gb.para}>
                  Before you start driving, the rider pays the <Text style={gb.bold}>full fare</Text> through
                  the app. We hold it in escrow and release it to you after the ride.
                </Text>
                <Text style={gb.para}>
                  You don't collect anything at pickup — the full amount hits your Stripe account after the ride
                  and clears to your bank on Stripe's standard schedule.
                </Text>
              </View>
            )}

            <TouchableOpacity style={[gb.closeBtn, { backgroundColor: accentColor }]} onPress={() => setExpanded(false)}>
              <Text style={gb.closeBtnText}>GOT IT</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const gb = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: radius.card, borderWidth: 1,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: radius.cardInner,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  headline: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1.5 },
  short:    { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, marginTop: 2, lineHeight: 17 },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: spacing.xl, gap: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.borderStrong,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingBottom: spacing.md, borderBottomWidth: 1,
  },
  sheetTitle: { fontFamily: fonts.monoBold, fontSize: 15, letterSpacing: 1.5 },
  body: { gap: spacing.md },
  para: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 22 },
  bold: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },

  whyCard: {
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  whyTitle: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2, marginBottom: 4 },
  whyRow:   { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bullet:   { fontFamily: fonts.monoBold, fontSize: 13, color: colors.green, width: 20 },
  whyText:  { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },

  closeBtn: { borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
});

// ── Stripe history progress ───────────────────────────────────────────────────

function StripeProgressCard({ completedRides, clearingDays }: { completedRides: number; clearingDays: number }) {
  // Thresholds: 0-9 rides = 10 days, 10-49 = 7 days, 50+ = 2 days
  const milestones = [
    { rides: 10,  days: 7,  label: '7-day clearing' },
    { rides: 50,  days: 2,  label: '2-day clearing' },
  ];
  const next = milestones.find(m => completedRides < m.rides);
  const pct  = next ? Math.min(completedRides / next.rides, 1) : 1;

  return (
    <View style={sp.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={sp.title}>STRIPE HISTORY</Text>
        <Text style={sp.current}>{clearingDays}-day clearing</Text>
      </View>
      <View style={sp.track}>
        <View style={[sp.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <Text style={sp.note}>
        {next
          ? `${next.rides - completedRides} more rides to unlock ${next.label}`
          : 'Maximum clearing speed reached'}
      </Text>
      <View style={sp.stripeNote}>
        <Ionicons name="information-circle-outline" size={12} color={colors.textFaint} />
        <Text style={sp.stripeText}>
          Clearing speed is set by Stripe based on your account activity — not by HMU.
          More rides = more Stripe history = faster payouts.
        </Text>
      </View>
    </View>
  );
}

const sp = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  title:   { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },
  current: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.green },
  track: {
    height: 6, backgroundColor: colors.cardAlt,
    borderRadius: 3, overflow: 'hidden',
  },
  fill: {
    height: 6, backgroundColor: colors.green,
    borderRadius: 3, minWidth: 6,
  },
  note:      { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },
  stripeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.xs },
  stripeText: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 17 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PaymentPreview() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const getToken = useStableToken();

  const [fareText,   setFareText]   = useState('25');
  const [extrasText, setExtrasText] = useState('0');
  const [profile,    setProfile]    = useState<DriverPayProfile | null>(null);
  const [depositCfg, setDepositCfg] = useState<DepositConfig>(DEFAULT_DEPOSIT);
  const [isDepositMode, setIsDepositMode] = useState(true);
  const [preview, setPreview] = useState<PayoutPreview | null>(null);

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
  const completedRides = profile?.completedRides ?? 0;
  const payoutSetup    = profile?.payout?.setupComplete ?? false;

  // Clearing window: new account (< 10 rides or no payout) = 10 days, 10-49 = 7 days, 50+ = 2 days
  const clearingDays = !payoutSetup || completedRides < 10 ? 10
    : completedRides < 50 ? 7
    : 2;

  const availDate = availableDate(clearingDays);

  // ── Deposit mode calculations (server-computed, canonical) ──────────────────
  // Debounced fetch so the breakdown always matches capture math + the live
  // config + the configurable Stripe-fee bearer. Falls back to last value while
  // typing; never recomputes deposit/fees locally.
  useEffect(() => {
    if (!isDepositMode || fare <= 0) { setPreview(null); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const t = await getToken();
        const q = `fare=${fare}&extras=${extras}`;
        const p = await apiClient<PayoutPreview>(`/driver/payout-preview?${q}`, t);
        if (!cancelled) setPreview(p);
      } catch { /* keep last preview on transient error */ }
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [fare, extras, isDepositMode, getToken]);

  const deposit          = preview?.deposit ?? 0;
  const depositStripeFee = preview?.stripeFee ?? 0;
  const depositPlatform  = preview?.hmuFee ?? 0;          // HMU's net cut
  const netDeposit       = preview?.driverViaStripe ?? 0; // deposit − HMU fee − (driver-borne Stripe)
  const extrasStripeFee  = preview?.extras.stripeFee ?? 0;
  const extrasPlatform   = preview?.extras.hmuFee ?? 0;
  const netExtras        = preview?.extras.driverViaStripe ?? 0;
  const cashAtPickup     = preview?.cashAtPickup ?? 0;
  const totalStripe      = Math.round((netDeposit + netExtras) * 100) / 100;
  const grandTotal       = preview?.totalEarned ?? 0;

  // ── Full fare calculations ───────────────────────────────────────────────────
  const fullPayout = calculateDriverPayout(fare + extras, tier, 0, 0, 0);

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
        {/* Guarantee banner — tap to expand */}
        <Animated.View entering={FadeIn.duration(400)}>
          <GuaranteeBanner isDepositMode={isDepositMode} />
        </Animated.View>

        {/* Input */}
        <Animated.View entering={FadeInUp.delay(80).duration(400)} style={[s.card, shadow.card]}>
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
              <Text style={s.inputLabel}>EXTRAS</Text>
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

        {/* ── Quick summary — right after inputs ── */}
        {isDepositMode ? (
          <Animated.View entering={FadeInUp.delay(140).duration(350)} style={s.quickSummary}>
            <Text style={s.quickLabel}>YOUR EARNINGS AT A GLANCE</Text>
            <View style={s.quickRow}>
              <View style={s.quickItem}>
                <Ionicons name="cash-outline" size={18} color={colors.green} />
                <Text style={s.quickValue}>{fmt(cashAtPickup)}</Text>
                <Text style={s.quickSub}>cash at pickup</Text>
              </View>
              <View style={s.quickDivider} />
              <View style={s.quickItem}>
                <Ionicons name="card-outline" size={18} color={colors.amber} />
                <Text style={[s.quickValue, { color: colors.amber }]}>{fmt(totalStripe)}</Text>
                <Text style={s.quickSub}>via Stripe by {availDate}</Text>
              </View>
              <View style={s.quickDivider} />
              <View style={s.quickItem}>
                <Ionicons name="wallet-outline" size={18} color={colors.textPrimary} />
                <Text style={s.quickValue}>{fmt(grandTotal)}</Text>
                <Text style={s.quickSub}>total earned</Text>
              </View>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInUp.delay(140).duration(350)} style={s.quickSummary}>
            <Text style={s.quickLabel}>YOUR EARNINGS AT A GLANCE</Text>
            <View style={[s.quickRow, { justifyContent: 'center' }]}>
              <View style={s.quickItem}>
                <Ionicons name="card-outline" size={18} color={colors.amber} />
                <Text style={[s.quickValue, { color: colors.amber }]}>{fmt(fullPayout.driverReceives)}</Text>
                <Text style={s.quickSub}>via Stripe by {availDate}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Detailed breakdown ── */}
        {isDepositMode ? (
          <>
            {/* Deposit breakdown */}
            <Animated.View entering={FadeInUp.delay(200).duration(400)} style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>DEPOSIT — RIDER PAYS AT BOOKING</Text>
              <Row label="Deposit collected"      value={fmt(deposit)} />
              <Row label="HMU platform fee"       value={`- ${fmt(depositPlatform)}`}  sub={preview?.stripeBearer === 'driver' ? "HMU's cut" : "HMU's cut (after Stripe)"} dim />
              <Row label="Stripe processing fee"  value={`- ${fmt(depositStripeFee)}`} sub={preview?.stripeBearer === 'driver' ? '2.9% + $0.30 — you pay this' : '2.9% + $0.30 — paid by HMU'} dim />
              <Row label="You receive via Stripe" value={fmt(netDeposit)} accent />
              <View style={s.availPill}>
                <Ionicons name="time-outline" size={12} color={colors.amber} />
                <Text style={s.availText}>Available by {availDate} · set by Stripe, not HMU</Text>
              </View>
            </Animated.View>

            {/* Extras breakdown — only if extras > 0 */}
            {extras > 0 && (
              <Animated.View entering={FadeInUp.delay(240).duration(400)} style={[s.card, shadow.card]}>
                <Text style={s.cardLabel}>EXTRAS — ALSO CHARGED VIA STRIPE</Text>
                <Row label="Extras collected"       value={fmt(extras)} />
                <Row label="HMU platform fee"       value={`- ${fmt(extrasPlatform)}`}  sub={preview?.stripeBearer === 'driver' ? "HMU's cut" : "HMU's cut (after Stripe)"} dim />
                <Row label="Stripe processing fee"  value={`- ${fmt(extrasStripeFee)}`} sub={preview?.stripeBearer === 'driver' ? '2.9% + $0.30 — you pay this' : '2.9% + $0.30 — paid by HMU'} dim />
                <Row label="You receive via Stripe" value={fmt(netExtras)} accent />
                <View style={s.availPill}>
                  <Ionicons name="time-outline" size={12} color={colors.amber} />
                  <Text style={s.availText}>Same window — available by {availDate}</Text>
                </View>
              </Animated.View>
            )}

            {/* Cash at pickup */}
            <Animated.View entering={FadeInUp.delay(280).duration(400)} style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>CASH — COLLECT FROM RIDER AT PICKUP</Text>
              <Row label="Agreed ride fare"        value={fmt(fare)} />
              <Row label="Deposit already paid"    value={`- ${fmt(deposit)}`} dim />
              <Row label="Cash you collect"        value={fmt(cashAtPickup)} accent />
              <View style={[s.availPill, { backgroundColor: colors.greenDim, borderColor: colors.greenBorder }]}>
                <Ionicons name="cash-outline" size={12} color={colors.green} />
                <Text style={[s.availText, { color: colors.green }]}>
                  Instant — in your hand when you pull up
                </Text>
              </View>
            </Animated.View>

            {/* Total reinforced */}
            <Animated.View entering={FadeInUp.delay(320).duration(400)} style={s.summaryCard}>
              <Text style={s.summaryLabel}>TOTAL THIS RIDE</Text>
              <Text style={s.summaryValue}>{fmt(grandTotal)}</Text>
              <Text style={s.summarySub}>
                {fmt(cashAtPickup)} cash at pickup + {fmt(totalStripe)} via Stripe by {availDate}
              </Text>
            </Animated.View>
          </>
        ) : (
          <>
            <Animated.View entering={FadeInUp.delay(200).duration(400)} style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>FULL FARE — RIDER PAYS AT BOOKING</Text>
              <Row label="Total collected"         value={fmt(fare + extras)} />
              <Row label="Stripe processing fee"   value={`- ${fmt(fullPayout.stripeFee)}`}   sub="2.9% + $0.30 — Stripe charges this" dim />
              <Row label="HMU platform fee"        value={`- ${fmt(fullPayout.platformFee)}`} sub={`${tier === 'hmu_first' ? '12' : '10'}% (${tier === 'hmu_first' ? 'HMU First' : 'Free'})`} dim />
              <Row label="You receive via Stripe"  value={fmt(fullPayout.driverReceives)} accent />
              <View style={s.availPill}>
                <Ionicons name="time-outline" size={12} color={colors.amber} />
                <Text style={s.availText}>Available by {availDate} · set by Stripe, not HMU</Text>
              </View>
            </Animated.View>

            {/* Total reinforced */}
            <Animated.View entering={FadeInUp.delay(240).duration(400)} style={s.summaryCard}>
              <Text style={s.summaryLabel}>TOTAL THIS RIDE</Text>
              <Text style={s.summaryValue}>{fmt(fullPayout.driverReceives)}</Text>
              <Text style={s.summarySub}>Via Stripe by {availDate} — nothing to collect at pickup</Text>
            </Animated.View>
          </>
        )}

        {/* Stripe history progress */}
        <Animated.View entering={FadeInUp.delay(340).duration(400)}>
          <StripeProgressCard completedRides={completedRides} clearingDays={clearingDays} />
        </Animated.View>

        {/* Payout setup CTA if needed */}
        {!payoutSetup && (
          <Animated.View entering={FadeInUp.delay(400).duration(400)}>
            <TouchableOpacity
              style={s.setupBtn}
              onPress={() => router.push('/(driver)/payout-setup' as never)}
              activeOpacity={0.85}
            >
              <Ionicons name="card-outline" size={16} color={colors.bg} />
              <Text style={s.setupBtnText}>SET UP PAYOUT TO RECEIVE DEPOSITS</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 1.5 },

  content: { padding: spacing.xl, gap: spacing.lg },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, gap: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.xs },

  inputRow:  { flexDirection: 'row', gap: spacing.md },
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

  availPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.amberBorder, marginTop: spacing.sm,
  },
  availText: { fontFamily: fonts.mono, fontSize: 10, color: colors.amber, flex: 1 },

  quickSummary: {
    backgroundColor: colors.cardAlt, borderRadius: radius.card,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong,
  },
  quickLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.md },
  quickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quickItem: { flex: 1, alignItems: 'center', gap: 4 },
  quickValue: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary },
  quickSub: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, textAlign: 'center', letterSpacing: 0.5 },
  quickDivider: { width: 1, height: 40, backgroundColor: colors.border },

  summaryCard: {
    backgroundColor: colors.greenDim, borderRadius: radius.card,
    padding: spacing.xl, alignItems: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  summaryLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },
  summaryValue: { fontFamily: fonts.display, fontSize: 48, color: colors.green },
  summarySub: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, textAlign: 'center', lineHeight: 18 },

  setupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.amber,
    borderRadius: radius.pill, paddingVertical: 15,
  },
  setupBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.bg, letterSpacing: 1.5 },
});
