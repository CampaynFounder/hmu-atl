import { useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';

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
        router.replace('/');
      }
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>HMU ATL</Text>
        <Text style={styles.tagline}>Join the crew.</Text>

        {step === 'phone' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="+1 (404) 555-0000"
              placeholderTextColor="#555"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              autoComplete="tel"
            />
            <TouchableOpacity style={styles.btn} onPress={startSignUp} disabled={loading || !phone}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Create Account</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor="#555"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              autoComplete="one-time-code"
            />
            <TouchableOpacity style={styles.btn} onPress={verifyCode} disabled={loading || code.length < 6}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Verify</Text>}
            </TouchableOpacity>
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity style={styles.ghost} onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={styles.ghostText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808' },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 36, fontWeight: '900', color: '#00E676', textAlign: 'center', letterSpacing: 2, marginBottom: 8 },
  tagline: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 40 },
  input: {
    backgroundColor: '#18181b', color: '#fff', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#27272a', marginBottom: 12,
  },
  btn: {
    backgroundColor: '#00E676', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginBottom: 12,
  },
  btnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  ghost: { alignItems: 'center', paddingVertical: 12 },
  ghostText: { color: '#555', fontSize: 14 },
  error: { color: '#FF4444', textAlign: 'center', fontSize: 13, marginTop: 8 },
});
