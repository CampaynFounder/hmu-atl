import { useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { colors, fonts, radius, spacing } from '@/lib/theme';

export default function SignUp() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSignUp() {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signUp!.create({ phoneNumber: phone });
      await signUp!.preparePhoneNumberVerification();
      setStep('code');
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? 'Could not start sign-up');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp!.attemptPhoneNumberVerification({ code });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        // New users pick their role before entering the app
        router.replace('/(auth)/choose-role');
      }
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.inner}>
        <Text style={s.logo}>HMU ATL</Text>
        <Text style={s.tagline}>
          {step === 'phone' ? 'Join the crew.' : 'Check your texts.'}
        </Text>

        {step === 'phone' ? (
          <>
            <TextInput
              style={s.input}
              placeholder="+1 (404) 555-0000"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              autoComplete="tel"
            />
            <TouchableOpacity
              style={[s.btn, (!phone || loading) && s.btnDisabled]}
              onPress={startSignUp}
              disabled={loading || !phone}
            >
              {loading
                ? <ActivityIndicator color={colors.bg} />
                : <Text style={s.btnText}>CREATE ACCOUNT</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={s.input}
              placeholder="6-digit code"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              autoComplete="one-time-code"
            />
            <TouchableOpacity
              style={[s.btn, (code.length < 6 || loading) && s.btnDisabled]}
              onPress={verifyCode}
              disabled={loading || code.length < 6}
            >
              {loading
                ? <ActivityIndicator color={colors.bg} />
                : <Text style={s.btnText}>VERIFY</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.ghost} onPress={() => setStep('phone')}>
              <Text style={s.ghostText}>← Change number</Text>
            </TouchableOpacity>
          </>
        )}

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={s.ghost} onPress={() => router.replace('/(auth)/sign-in')}>
          <Text style={s.ghostText}>Already have an account? Sign in →</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },

  logo: { fontFamily: fonts.display, fontSize: 52, color: colors.green, textAlign: 'center', letterSpacing: 4, marginBottom: spacing.xs },
  tagline: { fontFamily: fonts.mono, fontSize: 12, color: colors.textFaint, textAlign: 'center', letterSpacing: 1, marginBottom: spacing.xxl },

  input: {
    backgroundColor: colors.card, color: colors.textPrimary,
    borderRadius: radius.cardInner, paddingHorizontal: spacing.lg,
    paddingVertical: 15, fontFamily: fonts.body, fontSize: 16,
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  btn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.bg, letterSpacing: 1.5 },

  ghost: { alignItems: 'center', paddingVertical: spacing.md },
  ghostText: { fontFamily: fonts.body, color: colors.textFaint, fontSize: 14 },

  errorBox: { backgroundColor: colors.redDim, borderRadius: radius.tag, padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder },
  errorText: { fontFamily: fonts.body, color: colors.red, fontSize: 13, textAlign: 'center' },
});
