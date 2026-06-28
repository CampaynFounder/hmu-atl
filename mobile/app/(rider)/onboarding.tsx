// Rider onboarding — runs once after choose-role, creates the rider_profiles row.
// Phase 1: handle + gender → POST /api/users/onboarding
// Phase 2: link payment method (navigates to payment-setup, polls on refocus)
// Phase 3: done → /(rider)/home

import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

type Phase = 'handle' | 'payment' | 'done';

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

export default function RiderOnboarding() {
  const insets = useSafeAreaInsets();
  const getToken = useStableToken();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('handle');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentLinked, setPaymentLinked] = useState(false);

  const canSave = displayName.trim().length >= 2 && gender !== '';

  async function saveProfile() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const t = await getToken();
      await apiClient('/users/onboarding', t, {
        method: 'POST',
        body: JSON.stringify({
          profile_type: 'rider',
          display_name: displayName.trim(),
          gender,
        }),
      });
      setPhase('payment');
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // Check payment status each time the payment phase screen gains focus
  useFocusEffect(useCallback(() => {
    if (phase !== 'payment') return;
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const methods = await apiClient<unknown[]>('/rider/payment-methods', t);
        if (!cancelled && Array.isArray(methods) && methods.length > 0) {
          setPaymentLinked(true);
        }
      } catch { /* no methods yet — that's fine */ }
    })();
    return () => { cancelled = true; };
  }, [phase]));

  // ── Handle phase ───────────────────────────────────────────────────────────
  if (phase === 'handle') {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.root, { paddingTop: insets.top }]}>
          <View style={s.header}>
            <Text style={s.stepTag}>STEP 1 OF 2</Text>
            <Text style={s.title}>WELCOME TO{'\n'}HMU ATL</Text>
            <Text style={s.subtitle}>Pick a handle — this is what drivers see when you book.</Text>
          </View>

          <View style={s.form}>
            <TextInput
              style={s.input}
              value={displayName}
              onChangeText={v => setDisplayName(v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
              placeholder="your_handle"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={20}
            />
            <Text style={s.hint}>{displayName.length}/20 · letters, numbers, underscores</Text>

            <Text style={s.fieldLabel}>GENDER</Text>
            <View style={s.pillRow}>
              {GENDERS.map(g => (
                <TouchableOpacity
                  key={g.value}
                  style={[s.pill, gender === g.value && s.pillActive]}
                  onPress={() => setGender(g.value)}
                >
                  <Text style={[s.pillText, gender === g.value && s.pillTextActive]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
          </View>

          <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <TouchableOpacity
              style={[s.btn, (!canSave || saving) && s.btnDisabled]}
              onPress={saveProfile}
              disabled={!canSave || saving}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator color={colors.bg} /> : (
                <>
                  <Text style={s.btnText}>CONTINUE</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.bg} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Payment phase ──────────────────────────────────────────────────────────
  if (phase === 'payment') {
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={s.header}>
          <Text style={s.stepTag}>STEP 2 OF 2</Text>
          <Text style={s.title}>LINK YOUR{'\n'}PAYMENT</Text>
          <Text style={s.subtitle}>HMU holds your card when a driver accepts. You're only charged at pickup.</Text>
        </View>

        <View style={[s.payCard, shadow.card, paymentLinked && s.payCardDone]}>
          {paymentLinked ? (
            <Animated.View entering={FadeIn} style={s.payDoneRow}>
              <View style={s.payDoneIcon}>
                <Ionicons name="checkmark-circle" size={32} color={colors.green} />
              </View>
              <View>
                <Text style={s.payDoneLabel}>Payment method linked</Text>
                <Text style={s.payDoneSub}>You're ready to book.</Text>
              </View>
            </Animated.View>
          ) : (
            <View style={s.payInner}>
              <View style={s.payMethods}>
                {(['logo-apple', 'logo-google', 'card-outline'] as const).map((icon, i) => (
                  <View key={i} style={s.payChip}>
                    <Ionicons name={icon} size={14} color={colors.textTertiary} />
                  </View>
                ))}
              </View>
              <Text style={s.payBody}>Apple Pay, Google Pay, or debit/credit card. Secured by Stripe.</Text>
              <TouchableOpacity
                style={s.btn}
                onPress={() => router.push('/(rider)/payment-setup' as any)}
                activeOpacity={0.85}
              >
                <Ionicons name="card-outline" size={16} color={colors.bg} />
                <Text style={s.btnText}>LINK PAYMENT METHOD</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={s.footer}>
          <TouchableOpacity style={s.btn} onPress={() => router.replace('/(rider)/home' as any)} activeOpacity={0.85}>
            <Text style={s.btnText}>{paymentLinked ? "LET'S GO" : 'SKIP FOR NOW'}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.bg} />
          </TouchableOpacity>
          {!paymentLinked && (
            <Text style={s.skipNote}>You'll be prompted to add a card before your first booking.</Text>
          )}
        </View>
      </View>
    );
  }

  // ── Done phase (fallback) ──────────────────────────────────────────────────
  return (
    <View style={[s.root, { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View entering={ZoomIn.duration(400)} style={s.doneIcon}>
        <Ionicons name="checkmark-circle" size={56} color={colors.green} />
      </Animated.View>
      <Animated.Text entering={FadeIn.delay(200)} style={s.doneTitle}>YOU'RE IN,{'\n'}@{displayName}</Animated.Text>
      <Animated.View entering={FadeIn.delay(400)} style={{ width: '100%', marginTop: spacing.xl }}>
        <TouchableOpacity style={s.btn} onPress={() => router.replace('/(rider)/home' as any)} activeOpacity={0.85}>
          <Text style={s.btnText}>FIND A RIDE</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.bg} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: { padding: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  stepTag: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 2, marginBottom: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 42, color: colors.textPrimary, lineHeight: 44, marginBottom: spacing.sm },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 22 },

  form: { flex: 1, paddingHorizontal: spacing.xl, gap: spacing.md },
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5, marginTop: spacing.sm },

  input: {
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg, paddingVertical: 16,
    fontFamily: fonts.body, fontSize: 18, color: colors.textPrimary,
  },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  pillActive: { borderColor: colors.green, backgroundColor: colors.greenDim },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textTertiary },
  pillTextActive: { color: colors.green },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.tag,
    padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder,
  },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.red },

  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.sm },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.green,
    borderRadius: radius.pill, paddingVertical: 16,
  },
  btnDisabled: { opacity: 0.35 },
  btnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.2 },

  payCard: {
    marginHorizontal: spacing.xl, backgroundColor: colors.card,
    borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden',
    flex: 1, marginVertical: spacing.lg,
  },
  payCardDone: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  payInner: { flex: 1, padding: spacing.xl, justifyContent: 'center', gap: spacing.lg, alignItems: 'center' },
  payMethods: { flexDirection: 'row', gap: spacing.sm },
  payChip: {
    width: 40, height: 40, borderRadius: radius.cardInner,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  payBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 22 },
  payDoneRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.xl },
  payDoneIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.greenDim, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.greenBorder },
  payDoneLabel: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.green },
  payDoneSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, marginTop: 2 },

  skipNote: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center' },

  doneIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  doneTitle: { fontFamily: fonts.display, fontSize: 40, color: colors.textPrimary, textAlign: 'center' },
});
