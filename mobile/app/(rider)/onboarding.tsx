// Rider onboarding — runs once after choose-role, creates the rider_profiles row.
// Single step: pick a handle + gender → POST /api/users/onboarding → home.
// Payment is NOT collected here. The rider lands on home, where the shared
// <PaymentGate> shows the professional "add payment method" surface, and every
// booking screen is wrapped in <RequirePayment> — so a card is required before
// any ride request, through any route.

import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStableToken } from '@/hooks/use-stable-token';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { AvatarMediaPicker, type CapturedMedia } from '@/components/AvatarMediaPicker';

type Vis = 'required' | 'optional' | 'hidden' | 'deferred';

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

  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Admin-tunable: /admin/onboarding-config → rider profile-fields → photo.
  const [photoField, setPhotoField] = useState<Vis>('hidden');
  const [media, setMedia] = useState<CapturedMedia | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        // The public endpoint nests under `config` (mirrors driver-express-config).
        const cfg = await apiClient<{ config?: { fields?: { photo?: Vis } } }>('/onboarding/rider-profile-fields-config', t);
        if (cfg?.config?.fields?.photo) setPhotoField(cfg.config.fields.photo);
      } catch { /* default hidden — onboarding unchanged */ }
    })();
  }, [getToken]);

  const photoInFlow = photoField === 'required' || photoField === 'optional';
  const photoRequired = photoField === 'required';
  const canSave = displayName.trim().length >= 2 && gender !== '' && (!photoRequired || !!media);

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
          // Captured photo/video becomes the rider avatar (thumbnail_url).
          ...(media ? { thumbnail_url: media.url, ...(media.isVideo ? { video_url: media.url } : {}) } : {}),
        }),
      });
      // Straight to home — the rider adds a payment method there via the shared
      // PaymentGate (and is required to before any booking).
      router.replace('/(rider)/home' as any);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <Text style={s.stepTag}>RIDER SETUP</Text>
          <Text style={s.title}>WELCOME TO{'\n'}HMU ATL</Text>
          <Text style={s.subtitle}>Pick a handle — this is what drivers see when you book.</Text>
        </View>

        <ScrollView style={s.form} contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.lg }} keyboardShouldPersistTaps="handled">
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

          {photoInFlow && (
            <>
              <Text style={s.fieldLabel}>PROFILE PHOTO OR VIDEO{photoRequired ? '' : ' (optional)'}</Text>
              <AvatarMediaPicker profileType="rider" value={media} onChange={setMedia} />
            </>
          )}

          {error && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

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
});
