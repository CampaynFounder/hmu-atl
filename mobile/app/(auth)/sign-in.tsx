import { useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { colors, fonts, radius, spacing } from '@/lib/theme';

export default function SignIn() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signIn!.create({ strategy: 'phone_code', identifier: phone });
      const phoneFactor = signIn!.supportedFirstFactors?.find((f: { strategy: string }) => f.strategy === 'phone_code') as { strategy: 'phone_code'; phoneNumberId: string } | undefined;
      if (!phoneFactor || !('phoneNumberId' in phoneFactor)) throw new Error('Phone sign-in not available');
      await signIn!.prepareFirstFactor({ strategy: 'phone_code', phoneNumberId: phoneFactor.phoneNumberId });
      setStep('code');
    } catch (e: any) {
      const clerkCode: string = e.errors?.[0]?.code ?? '';
      const msg: string = e.errors?.[0]?.message ?? 'Could not send code';
      const isRateLimit = clerkCode === 'too_many_requests' ||
        msg.toLowerCase().includes('too many') ||
        msg.toLowerCase().includes('rate limit');

      if (isRateLimit) {
        // Code was already sent — advance to OTP without showing a red error
        setError(null);
        setStep('code');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signIn!.attemptFirstFactor({ strategy: 'phone_code', code });
      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        router.replace('/');
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
        {/* Logo */}
        <Text style={s.logo}>HMU ATL</Text>
        <Text style={s.tagline}>
          {step === 'phone' ? 'Enter your number to get in' : 'Check your texts'}
        </Text>

        {step === 'phone' ? (
          <>
            <TextInput
              style={s.input}
              placeholder="+1 (404) 555-0000"
              placeholderTextColor={colors.textFaint}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={v => { setPhone(v); setError(null); }}
              autoComplete="tel"
            />
            <TouchableOpacity
              style={[s.btn, (!phone || loading) && s.btnDisabled]}
              onPress={sendCode}
              disabled={loading || !phone}
            >
              {loading
                ? <ActivityIndicator color={colors.bg} />
                : <Text style={s.btnText}>SEND CODE</Text>
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

        <TouchableOpacity style={s.ghost} onPress={() => router.push('/(auth)/sign-up')}>
          <Text style={s.ghostText}>No account? Sign up →</Text>
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
