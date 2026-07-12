// Driver payout onboarding — Option B: fully NATIVE KYC forms on a Stripe
// Custom account. No WebView, no browser. Reached from payout-setup.tsx when
// payoutMode === 'native' (feature flag driver_payout_native_forms ON, and the
// driver has no Connect account yet). A gamified step-by-step flow:
//   0 agree → 1 DOB → 2 SSN(4) → 3 address → 4 bank → 5 done
// Individual KYC posts to /native/individual; bank is tokenized client-side by
// the Stripe SDK (we never see the account/routing numbers) and posted to
// /native/external-account.

import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInRight, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useStableToken } from '@/hooks/use-stable-token';
import { apiClient } from '@/lib/api';
import { colors, fonts, radius, spacing } from '@/lib/theme';

let StripeModule: typeof import('@stripe/stripe-react-native') | null = null;
try { StripeModule = require('@stripe/stripe-react-native') as typeof import('@stripe/stripe-react-native'); } catch { StripeModule = null; }

interface Requirements {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  currentlyDue: string[];
  disabledReason: string | null;
}

const TOTAL_STEPS = 5; // agree/dob/ssn/address/bank (celebration is separate)
const onlyDigits = (v: string) => v.replace(/\D/g, '');

export default function PayoutNative() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const getToken = useStableToken();
  const stripe = StripeModule?.useStripe();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'live' | 'review' | null>(null);
  const [instantEligible, setInstantEligible] = useState(false);

  // form state
  const [dobM, setDobM] = useState(''); const [dobD, setDobD] = useState(''); const [dobY, setDobY] = useState('');
  const [ssn4, setSsn4] = useState('');
  const [line1, setLine1] = useState(''); const [line2, setLine2] = useState('');
  const [city, setCity] = useState(''); const [state, setState] = useState(''); const [zip, setZip] = useState('');
  const [holder, setHolder] = useState(''); const [routing, setRouting] = useState(''); const [account, setAccount] = useState('');

  const advance = useCallback(async (n = 1) => {
    await Haptics.selectionAsync();
    setError(null);
    setStep((s) => s + n);
  }, []);

  // Step 0 → create the Custom account + record ToS acceptance.
  const acceptAndStart = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const t = await getToken();
      await apiClient('/driver/payout-setup/native/account', t, { method: 'POST' });
      await advance();
    } catch (e: any) {
      setError(e?.message ?? 'Could not start. Try again.');
    } finally { setBusy(false); }
  }, [getToken, advance]);

  // Step 3 → submit DOB + SSN(4) + address together.
  const submitIndividual = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const t = await getToken();
      await apiClient('/driver/payout-setup/native/individual', t, {
        method: 'POST',
        body: JSON.stringify({
          dob: { month: Number(dobM), day: Number(dobD), year: Number(dobY) },
          ssnLast4: ssn4,
          address: { line1, line2: line2 || undefined, city, state, postal_code: zip },
        }),
      });
      await advance();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save your details. Check them and retry.');
    } finally { setBusy(false); }
  }, [getToken, advance, dobM, dobD, dobY, ssn4, line1, line2, city, state, zip]);

  // Step 4 → tokenize the bank account client-side, attach it, finish.
  const submitBank = useCallback(async () => {
    if (!stripe) { setError('Update the app to add a bank account.'); return; }
    setBusy(true); setError(null);
    try {
      const { token, error: tokErr } = await stripe.createToken({
        type: 'BankAccount',
        accountNumber: onlyDigits(account),
        routingNumber: onlyDigits(routing),
        accountHolderName: holder.trim(),
        accountHolderType: 'Individual',
        country: 'US',
        currency: 'usd',
      });
      if (tokErr || !token) { setError(tokErr?.message ?? 'Check your routing + account numbers.'); setBusy(false); return; }

      const t = await getToken();
      const res = await apiClient<{ requirements: Requirements; externalAccount?: { instantEligible?: boolean } }>(
        '/driver/payout-setup/native/external-account', t,
        { method: 'POST', body: JSON.stringify({ token: token.id }) },
      );
      setInstantEligible(!!res.externalAccount?.instantEligible);
      const live = res.requirements?.payoutsEnabled && res.requirements?.chargesEnabled;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(live ? 'live' : 'review');
    } catch (e: any) {
      setError(e?.message ?? 'Could not add your bank. Try again.');
    } finally { setBusy(false); }
  }, [stripe, account, routing, holder, getToken]);

  // ─── Celebration / review ────────────────────────────────────────────────
  if (done) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, padding: spacing.xl }]}>
        <Animated.View entering={ZoomIn.duration(420)} style={s.celebrateIcon}>
          <Ionicons name={done === 'live' ? 'checkmark-circle' : 'hourglass'} size={72} color={done === 'live' ? colors.green : colors.amber} />
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(150)} style={[s.celebrateTitle, done === 'review' && { color: colors.amber }]}>
          {done === 'live' ? 'PAYOUTS UNLOCKED' : 'SUBMITTED FOR REVIEW'}
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(250)} style={s.celebrateBody}>
          {done === 'live'
            ? 'Your bank is linked and payouts are live. Every ride pays out straight here.'
            : "Your details are in. Stripe is verifying your account — we'll notify you the moment payouts go live (usually minutes)."}
        </Animated.Text>
        {done === 'live' && instantEligible ? (
          <Animated.View entering={FadeIn.delay(350)} style={s.instantBadge}>
            <Ionicons name="flash" size={13} color={colors.green} />
            <Text style={s.instantText}>INSTANT PAYOUTS ELIGIBLE</Text>
          </Animated.View>
        ) : null}
        <TouchableOpacity style={[s.cta, { marginTop: spacing.xxl, width: '100%' }]} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={s.ctaText}>{done === 'live' ? 'START EARNING' : 'DONE'}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.bg} />
        </TouchableOpacity>
      </View>
    );
  }

  const canDob = !!(dobM && dobD && dobY.length === 4);
  const canSsn = ssn4.length === 4;
  const canAddr = !!(line1 && city && state.length === 2 && zip.length >= 5);
  const canBank = !!(holder.trim() && onlyDigits(routing).length === 9 && onlyDigits(account).length >= 4);

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => (step === 0 ? router.back() : setStep((v) => v - 1))} style={s.closeBtn} hitSlop={12}>
            <Ionicons name={step === 0 ? 'close' : 'chevron-back'} size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>GET PAID</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* progress */}
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
        </View>
        <Text style={s.progressLabel}>STEP {Math.min(step + 1, TOTAL_STEPS)} OF {TOTAL_STEPS}</Text>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {step === 0 && (
            <Animated.View entering={FadeInRight.duration(300)} style={s.stepWrap}>
              <Text style={s.stepTitle}>Let&apos;s get you paid.</Text>
              <Text style={s.stepBody}>Two minutes, all in the app. Add your info and a bank account and every ride pays out straight to you.</Text>
              <View style={s.tosBox}>
                <Text style={s.tosText}>By continuing you agree to Stripe&apos;s Connected Account Agreement, including the Stripe Services Agreement.</Text>
              </View>
            </Animated.View>
          )}

          {step === 1 && (
            <Animated.View entering={FadeInRight.duration(300)} style={s.stepWrap}>
              <Text style={s.stepTitle}>Date of birth</Text>
              <Text style={s.stepBody}>Required to verify your identity.</Text>
              <View style={s.row}>
                <Field style={{ flex: 1 }} label="MM" value={dobM} onChange={(v) => setDobM(onlyDigits(v).slice(0, 2))} keyboardType="number-pad" placeholder="04" />
                <Field style={{ flex: 1 }} label="DD" value={dobD} onChange={(v) => setDobD(onlyDigits(v).slice(0, 2))} keyboardType="number-pad" placeholder="20" />
                <Field style={{ flex: 1.4 }} label="YYYY" value={dobY} onChange={(v) => setDobY(onlyDigits(v).slice(0, 4))} keyboardType="number-pad" placeholder="1998" />
              </View>
            </Animated.View>
          )}

          {step === 2 && (
            <Animated.View entering={FadeInRight.duration(300)} style={s.stepWrap}>
              <Text style={s.stepTitle}>Last 4 of your SSN</Text>
              <Text style={s.stepBody}>Stripe uses this to verify you. We never store it.</Text>
              <Field label="SSN (last 4)" value={ssn4} onChange={(v) => setSsn4(onlyDigits(v).slice(0, 4))} keyboardType="number-pad" placeholder="1234" secureTextEntry />
            </Animated.View>
          )}

          {step === 3 && (
            <Animated.View entering={FadeInRight.duration(300)} style={s.stepWrap}>
              <Text style={s.stepTitle}>Home address</Text>
              <Field label="Street" value={line1} onChange={setLine1} placeholder="123 Peachtree St" />
              <Field label="Apt / unit (optional)" value={line2} onChange={setLine2} placeholder="Apt 4" />
              <Field label="City" value={city} onChange={setCity} placeholder="Your city" />
              <View style={s.row}>
                <Field style={{ flex: 1 }} label="State" value={state} onChange={(v) => setState(v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))} placeholder="GA" autoCapitalize="characters" />
                <Field style={{ flex: 1.4 }} label="ZIP" value={zip} onChange={(v) => setZip(onlyDigits(v).slice(0, 5))} keyboardType="number-pad" placeholder="30303" />
              </View>
            </Animated.View>
          )}

          {step === 4 && (
            <Animated.View entering={FadeInRight.duration(300)} style={s.stepWrap}>
              <Text style={s.stepTitle}>Where should we pay you?</Text>
              <Text style={s.stepBody}>Your bank account — routing + account number.</Text>
              <Field label="Account holder name" value={holder} onChange={setHolder} placeholder="Jordan Rivera" autoCapitalize="words" />
              <Field label="Routing number" value={routing} onChange={(v) => setRouting(onlyDigits(v).slice(0, 9))} keyboardType="number-pad" placeholder="110000000" />
              <Field label="Account number" value={account} onChange={(v) => setAccount(onlyDigits(v).slice(0, 17))} keyboardType="number-pad" placeholder="000123456789" secureTextEntry />
              <View style={s.secureRow}>
                <Ionicons name="lock-closed" size={12} color={colors.textFaint} />
                <Text style={s.secureText}>Encrypted and sent straight to Stripe. HMU never sees your numbers.</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={[s.cta, (busy || !stepValid(step, { canDob, canSsn, canAddr, canBank })) && s.ctaDisabled]}
            disabled={busy || !stepValid(step, { canDob, canSsn, canAddr, canBank })}
            onPress={() => {
              if (step === 0) return void acceptAndStart();
              if (step === 3) return void submitIndividual();
              if (step === 4) return void submitBank();
              return void advance();
            }}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color={colors.bg} /> : (
              <>
                <Text style={s.ctaText}>{step === 0 ? 'AGREE & CONTINUE' : step === 4 ? 'LINK BANK & FINISH' : 'CONTINUE'}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.bg} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function stepValid(step: number, v: { canDob: boolean; canSsn: boolean; canAddr: boolean; canBank: boolean }): boolean {
  if (step === 1) return v.canDob;
  if (step === 2) return v.canSsn;
  if (step === 3) return v.canAddr;
  if (step === 4) return v.canBank;
  return true; // step 0
}

function Field({
  label, value, onChange, placeholder, keyboardType, secureTextEntry, autoCapitalize, style,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'number-pad'; secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'words' | 'characters'; style?: object;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={s.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType ?? 'default'}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textPrimary, letterSpacing: 1.5 },

  progressTrack: { height: 4, backgroundColor: colors.card, marginHorizontal: spacing.xl, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.green, borderRadius: 2 },
  progressLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5, marginTop: 6, marginHorizontal: spacing.xl },

  content: { padding: spacing.xl, gap: spacing.md },
  stepWrap: { gap: spacing.md },
  stepTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.textPrimary, lineHeight: 34 },
  stepBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 21 },
  row: { flexDirection: 'row', gap: spacing.sm },

  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1.2 },
  input: {
    backgroundColor: colors.card, color: colors.textPrimary,
    borderRadius: radius.cardInner, paddingHorizontal: spacing.lg, paddingVertical: 15,
    fontFamily: fonts.body, fontSize: 17, borderWidth: 1, borderColor: colors.borderStrong,
  },
  tosBox: {
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm,
  },
  tosText: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, lineHeight: 18 },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  secureText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 17 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.tag, padding: spacing.md,
    borderWidth: 1, borderColor: colors.redBorder,
  },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.red },

  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.green, borderRadius: radius.pill, paddingVertical: 16,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.bg, letterSpacing: 1.2 },

  celebrateIcon: {
    width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, marginBottom: spacing.lg,
  },
  celebrateTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.green, letterSpacing: 1, textAlign: 'center' },
  celebrateBody: { fontFamily: fonts.body, fontSize: 15, color: colors.textTertiary, textAlign: 'center', lineHeight: 22, marginTop: spacing.md },
  instantBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg,
    backgroundColor: colors.greenDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.greenBorder,
  },
  instantText: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 1 },
});
