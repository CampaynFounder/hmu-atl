// Down Bad Booking — cash offer, first driver to pull up wins.
// 3-step wizard: locations → cash amount + details → sum extra text + photo
// POST /api/rider/down-bad → waiting screen
// Requires: npx expo install expo-image-picker

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, TextInput, Image, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';

// expo-image-picker requires a native rebuild to link ExponentImagePicker.
// Guard so the screen loads even on builds that predate the native module.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
} catch {
  console.warn('[down-bad] expo-image-picker not available — rebuild with npx expo run:ios');
}
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient, API_BASE } from '@/lib/api';
import { AddressInput, ValidatedAddress } from '@/components/AddressInput';

interface DownBadConfig {
  cashFloor: number;
  cashCeiling: number;
  sumExtraMaxChars: number;
  enabled: boolean;
  disclaimerText: string;
}

const DEFAULT_CONFIG: DownBadConfig = {
  cashFloor: 5,
  cashCeiling: 30,
  sumExtraMaxChars: 120,
  enabled: true,
  disclaimerText: 'Down Bad posts involve an exchange of goods or services alongside cash. HMU does not verify or guarantee any offer. Both parties agree to this exchange voluntarily.',
};

type Luggage = 'none' | 'bag' | 'trunk';

export default function DownBadBooking() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const { prefillHandle } = useLocalSearchParams<{ prefillHandle?: string }>();

  const [step, setStep] = useState(0);
  const TOTAL = 3;

  const [config, setConfig] = useState<DownBadConfig>(DEFAULT_CONFIG);

  // Step 0 — locations
  const [pickup, setPickup] = useState<ValidatedAddress | null>(null);
  const [dropoff, setDropoff] = useState<ValidatedAddress | null>(null);

  // Step 1 — amount + details
  const [amount, setAmount] = useState(10);
  const [passengers, setPassengers] = useState(1);
  const [luggage, setLuggage] = useState<Luggage>('none');

  // Step 2 — sum extra
  const [sumText, setSumText] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [uploading, setUploading] = useState(false);
  const [disclaimerAcked, setDisclaimerAcked] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const t = await getToken();
        const cfg = await apiClient<{
          cashFloorCents?: number; cashCeilingCents?: number;
          sumExtraMaxChars?: number; enabled?: boolean; disclaimerText?: string;
        }>('/rider/down-bad-config', t);
        setConfig({
          cashFloor: Math.round((cfg.cashFloorCents ?? 500) / 100),
          cashCeiling: Math.round((cfg.cashCeilingCents ?? 3000) / 100),
          sumExtraMaxChars: cfg.sumExtraMaxChars ?? 120,
          enabled: cfg.enabled ?? true,
          disclaimerText: cfg.disclaimerText ?? DEFAULT_CONFIG.disclaimerText,
        });
      } catch {}
    }
    void loadConfig();
  }, [getToken]);

  async function pickPhoto() {
    if (!ImagePicker) {
      Alert.alert('Not available', 'Photo upload requires a fresh native build.\n\nRun: npx expo run:ios');
      return;
    }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Photo library access is needed to add a photo to your Down Bad post.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setMediaUri(asset.uri);
        setMediaUrl(null);
        await uploadMedia(asset.uri, asset.mimeType ?? 'image/jpeg');
      }
    } catch (e: any) {
      setError('Could not open photo library');
    }
  }

  async function uploadMedia(uri: string, mimeType: string) {
    setUploading(true);
    setError(null);
    try {
      const t = await getToken();
      const formData = new FormData();
      formData.append('file', { uri, type: mimeType, name: 'photo.jpg' } as any);
      const res = await fetch(`${API_BASE}/upload/down-bad-media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t ?? ''}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { mediaUrl: url, mediaType: type } = await res.json() as { mediaUrl: string; mediaType: 'photo' | 'video' };
      setMediaUrl(url);
      setMediaType(type);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError('Photo upload failed. Try again.');
      setMediaUri(null);
    } finally {
      setUploading(false);
    }
  }

  const charCount = [...sumText].length;
  const maxChars = config.sumExtraMaxChars;

  // Contact-info detection — matches API rule (max 4 digit groups) + phone patterns.
  // Prevents riders and drivers from exchanging numbers off-platform.
  const digitGroups = sumText.match(/\d+/g) ?? [];
  const hasLongDigits = digitGroups.some(g => g.length >= 5);
  const tooManyDigitGroups = digitGroups.length > 4;
  const phoneRegex = /(\+?1[\s\-.]?)?(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/;
  const hasContactInfo = hasLongDigits || tooManyDigitGroups || phoneRegex.test(sumText);

  function validateStep(): boolean {
    if (step === 0) return !!pickup && !!dropoff;
    if (step === 1) return amount >= config.cashFloor && amount <= config.cashCeiling;
    return sumText.trim().length > 0 && !!mediaUrl && !uploading && !hasContactInfo && disclaimerAcked;
  }

  async function advance() {
    if (!validateStep()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (step < TOTAL - 1) {
      setStep(s => s + 1);
      await Haptics.selectionAsync();
    } else {
      await submit();
    }
  }

  function back() {
    if (step === 0) router.back();
    else setStep(s => s - 1);
  }

  async function submit() {
    if (!pickup || !dropoff || !mediaUrl) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await getToken();
      const { postId, expiresAt } = await apiClient<{ postId: string; expiresAt: string }>(
        '/rider/down-bad',
        t,
        {
          method: 'POST',
          body: JSON.stringify({
            pickup_lat: pickup.latitude,
            pickup_lng: pickup.longitude,
            pickup_address: pickup.address,
            dropoff_lat: dropoff.latitude,
            dropoff_lng: dropoff.longitude,
            dropoff_address: dropoff.address,
            price: amount,
            ride_details: {
              additionalPassengers: passengers - 1,
              kids: false,
              luggage,
            },
            sum_extra_text: sumText.trim(),
            sum_extra_media_url: mediaUrl,
            sum_extra_media_type: mediaType,
            scheduled_for: null,
            target_driver_handle: prefillHandle ?? null,
          }),
        },
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: '/(rider)/book/waiting',
        params: {
          type: 'down-bad',
          postId,
          expiresAt,
          price: String(amount),
        },
      } as never);
    } catch (e: any) {
      setError(e.message ?? 'Could not post. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const btnLabel = step < TOTAL - 1 ? 'NEXT →' : submitting ? '' : 'POST MY DOWN BAD →';

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.header}>
        <TouchableOpacity onPress={back} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>DOWN BAD</Text>
          <StepDots total={TOTAL} current={step} />
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <Animated.View key="s0" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            {prefillHandle && (
              <View style={s.targetBadge}>
                <Ionicons name="flash" size={13} color={colors.amber} />
                <Text style={s.targetBadgeText}>Targeting @{prefillHandle}</Text>
              </View>
            )}
            <Text style={s.stepTitle}>WHERE TO?</Text>
            <Text style={s.stepDesc}>Set your pickup and destination. First driver to accept wins.</Text>
            <View style={[s.card, shadow.card]}>
              <AddressInput label="PICKUP" placeholder="Where are you?" value={pickup} onChange={setPickup} showLocateMe />
            </View>
            <View style={[s.card, shadow.card]}>
              <AddressInput label="DROPOFF" placeholder="Where are you going?" value={dropoff} onChange={setDropoff} />
            </View>
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View key="s1" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>HOW MUCH YOU GOT?</Text>
            <Text style={s.stepDesc}>
              This is your total cash for the whole trip — drivers know it might be less than going rate. That's what Down Bad is for. Min ${config.cashFloor}, max ${config.cashCeiling}.
            </Text>
            <View style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>BONUS CASH</Text>
              <PriceStepper
                value={amount}
                onChange={setAmount}
                min={config.cashFloor}
                max={config.cashCeiling}
                step={5}
                color={colors.amber}
              />
            </View>

            <View style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>PASSENGERS</Text>
              <View style={s.counterRow}>
                <TouchableOpacity
                  style={[s.counterBtn, passengers <= 1 && s.counterBtnDisabled]}
                  onPress={() => { setPassengers(v => Math.max(1, v - 1)); void Haptics.selectionAsync(); }}
                  disabled={passengers <= 1}
                >
                  <Text style={s.counterBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={s.counterValue}>{passengers}</Text>
                <TouchableOpacity
                  style={[s.counterBtn, passengers >= 6 && s.counterBtnDisabled]}
                  onPress={() => { setPassengers(v => Math.min(6, v + 1)); void Haptics.selectionAsync(); }}
                  disabled={passengers >= 6}
                >
                  <Text style={s.counterBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>LUGGAGE</Text>
              <View style={s.luggageRow}>
                {(['none', 'bag', 'trunk'] as Luggage[]).map(l => (
                  <TouchableOpacity
                    key={l}
                    style={[s.luggageBtn, luggage === l && s.luggageBtnActive]}
                    onPress={() => { setLuggage(l); void Haptics.selectionAsync(); }}
                  >
                    <Ionicons
                      name={l === 'none' ? 'close-outline' : l === 'bag' ? 'bag-outline' : 'cube-outline'}
                      size={18}
                      color={luggage === l ? colors.amber : colors.textFaint}
                    />
                    <Text style={[s.luggageLabel, luggage === l && s.luggageLabelActive]}>
                      {l.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View key="s2" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>WHAT ELSE YOU GOT?</Text>
            <Text style={s.stepDesc}>
              What are you offering alongside the cash? A skill, something from work, a service — be specific. No contact info.
            </Text>

            <View style={[s.card, shadow.card, hasContactInfo && { borderColor: colors.redBorder }]}>
              <Text style={s.cardLabel}>YOUR OFFER</Text>
              <TextInput
                style={s.sumTextInput}
                placeholder="e.g. I do hair, $20 + a cut when you get me to Buckhead"
                placeholderTextColor={colors.textFaint}
                value={sumText}
                onChangeText={t => { if ([...t].length <= maxChars) setSumText(t); }}
                multiline
                maxLength={maxChars * 2}
                returnKeyType="done"
              />
              <View style={s.textFooter}>
                <Text style={[s.charCount, charCount >= maxChars && { color: colors.red }]}>
                  {charCount}/{maxChars}
                </Text>
                {hasContactInfo && (
                  <Text style={s.contactWarn}>no contact info</Text>
                )}
              </View>
            </View>

            {hasContactInfo && (
              <Animated.View entering={FadeIn.duration(250)} style={s.contactBlock}>
                <Ionicons name="shield-outline" size={14} color={colors.red} />
                <Text style={s.contactBlockText}>
                  Looks like contact info. Remove any phone numbers — all communication happens through HMU after match.
                </Text>
              </Animated.View>
            )}

            <View style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>PHOTO OF YOUR OFFER (REQUIRED)</Text>
              {mediaUri ? (
                <Animated.View entering={FadeIn.duration(300)} style={s.photoPreview}>
                  <Image source={{ uri: mediaUri }} style={s.photoImage} resizeMode="cover" />
                  {uploading && (
                    <View style={s.photoOverlay}>
                      <ActivityIndicator color={colors.bg} />
                      <Text style={s.photoOverlayText}>Uploading...</Text>
                    </View>
                  )}
                  {mediaUrl && !uploading && (
                    <View style={s.photoSuccess}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                    </View>
                  )}
                  <TouchableOpacity style={s.photoRemove} onPress={() => { setMediaUri(null); setMediaUrl(null); }}>
                    <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </Animated.View>
              ) : (
                <TouchableOpacity style={s.photoPickBtn} onPress={pickPhoto} activeOpacity={0.8}>
                  <Ionicons name="camera-outline" size={28} color={colors.textFaint} />
                  <Text style={s.photoPickLabel}>PHOTO/VIDEO OF WHAT YOU'RE OFFERING</Text>
                  <Text style={s.photoPickSub}>Show drivers exactly what you're bringing to the table</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Admin-configured disclaimer — must be acknowledged before submit */}
            {config.disclaimerText ? (
              <TouchableOpacity
                style={[s.disclaimer, disclaimerAcked && s.disclaimerAcked]}
                onPress={() => { setDisclaimerAcked(v => !v); void Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                <View style={[s.disclaimerCheck, disclaimerAcked && s.disclaimerCheckActive]}>
                  {disclaimerAcked && <Ionicons name="checkmark" size={12} color={colors.bg} />}
                </View>
                <Text style={s.disclaimerText}>{config.disclaimerText}</Text>
              </TouchableOpacity>
            ) : null}

            {error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity
          style={[s.nextBtn, (!validateStep() || submitting || uploading) && s.nextBtnDisabled]}
          onPress={advance}
          disabled={!validateStep() || submitting || uploading}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator color={colors.bg} />
            : <Text style={s.nextBtnText}>{btnLabel}</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === current ? 16 : 6, height: 4,
            borderRadius: 2,
            backgroundColor: i === current ? colors.amber : colors.border,
          }}
        />
      ))}
    </View>
  );
}

function PriceStepper({ value, onChange, min, max, step, color = colors.textPrimary }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step: number; color?: string;
}) {
  return (
    <View style={ps.row}>
      <TouchableOpacity
        style={[ps.btn, value <= min && ps.btnDisabled]}
        onPress={() => { onChange(Math.max(min, value - step)); void Haptics.selectionAsync(); }}
        disabled={value <= min}
      >
        <Text style={ps.btnText}>−</Text>
      </TouchableOpacity>
      <View style={ps.valueWrap}>
        <Text style={[ps.dollar, { color }]}>$</Text>
        <Text style={[ps.value, { color }]}>{value}</Text>
      </View>
      <TouchableOpacity
        style={[ps.btn, value >= max && ps.btnDisabled]}
        onPress={() => { onChange(Math.min(max, value + step)); void Haptics.selectionAsync(); }}
        disabled={value >= max}
      >
        <Text style={ps.btnText}>+</Text>
      </TouchableOpacity>
    </View>
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
  headerCenter: { alignItems: 'center' },
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.amber, letterSpacing: 2 },

  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg },
  stepWrap: { gap: spacing.lg },
  stepTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.textPrimary },
  stepDesc: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 22, marginTop: -spacing.sm },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 3 },

  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counterBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  counterBtnDisabled: { opacity: 0.3 },
  counterBtnText: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary, lineHeight: 26 },
  counterValue: { fontFamily: fonts.display, fontSize: 36, color: colors.textPrimary },

  luggageRow: { flexDirection: 'row', gap: spacing.sm },
  luggageBtn: {
    flex: 1, paddingVertical: spacing.md, borderRadius: radius.cardInner,
    alignItems: 'center', gap: 6, backgroundColor: colors.cardAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  luggageBtnActive: { borderColor: colors.amberBorder, backgroundColor: colors.amberDim },
  luggageLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1 },
  luggageLabelActive: { color: colors.amber },

  sumTextInput: {
    fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary, lineHeight: 24,
    minHeight: 80, textAlignVertical: 'top',
  },
  textFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs,
  },
  charCount: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  contactWarn: { fontFamily: fonts.mono, fontSize: 10, color: colors.red, letterSpacing: 0.5 },
  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  disclaimerAcked: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  disclaimerCheck: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1.5,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  disclaimerCheckActive: { backgroundColor: colors.green, borderColor: colors.green },
  disclaimerText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, lineHeight: 18 },

  contactBlock: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder,
  },
  contactBlockText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.red, lineHeight: 18 },

  photoPickBtn: {
    height: 140, borderRadius: radius.cardInner, alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.cardAlt,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  photoPickLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1 },
  photoPickSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },

  photoPreview: { borderRadius: radius.cardInner, overflow: 'hidden', position: 'relative' },
  photoImage: { width: '100%', height: 180 },
  photoOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  photoOverlayText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textPrimary },
  photoSuccess: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: colors.bg, borderRadius: 12,
  },
  photoRemove: { position: 'absolute', top: 8, right: 8 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.redDim, borderRadius: radius.tag,
    padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder,
  },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.red },

  footer: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
  },
  nextBtn: {
    backgroundColor: colors.amber, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
  targetBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.amberDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.amberBorder, alignSelf: 'flex-start',
  },
  targetBadgeText: { fontFamily: fonts.mono, fontSize: 11, color: colors.amber, letterSpacing: 0.5 },
});

const ps = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btn: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  btnDisabled: { opacity: 0.3 },
  btnText: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, lineHeight: 28 },
  valueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  dollar: { fontFamily: fonts.display, fontSize: 22 },
  value: { fontFamily: fonts.display, fontSize: 44 },
});
