// Blast Booking — rider broadcasts to all drivers in their market.
// 5-step wizard: locations → trip type → when → price → driver preference
// POST /api/blast → blast board (real-time offer selection via Ably)

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInUp, FadeIn,
  useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { AddressInput, ValidatedAddress } from '@/components/AddressInput';
import { useBookingDraft } from '@/hooks/use-booking-draft';
import { ResumeDraftSheet } from '@/components/resume-draft-sheet';

interface BlastEstimate {
  distance_mi: number;
  estimated_minutes: number;
  suggested_price_dollars: number;
}

const TIME_OPTIONS = [
  { label: 'NOW', id: 'now' },
  { label: 'TONIGHT', id: 'tonight' },
  { label: 'TOMORROW', id: 'tomorrow' },
] as const;

const PREF_OPTIONS = [
  { label: 'ANY', id: 'any' },
  { label: 'WOMAN', id: 'woman' },
  { label: 'MAN', id: 'man' },
] as const;

type TripType = 'one_way' | 'round_trip';
type TimeOption = typeof TIME_OPTIONS[number]['id'];
type PrefOption = typeof PREF_OPTIONS[number]['id'];

function scheduledFor(time: TimeOption): string | null {
  if (time === 'now') return null;
  const d = new Date();
  if (time === 'tonight') {
    d.setHours(21, 0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate() + 1);
  } else {
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
  }
  return d.toISOString();
}

export default function BlastBooking() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const [step, setStep] = useState(0);
  const TOTAL = 5;

  // Step 0 — locations
  const [pickup, setPickup] = useState<ValidatedAddress | null>(null);
  const [dropoff, setDropoff] = useState<ValidatedAddress | null>(null);
  const [estimate, setEstimate] = useState<BlastEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  // Step 1 — trip type
  const [tripType, setTripType] = useState<TripType>('one_way');

  // Step 2 — when
  const [timeOption, setTimeOption] = useState<TimeOption>('now');

  // Step 3 — price
  const [price, setPrice] = useState(25);
  const [priceSetByUser, setPriceSetByUser] = useState(false);

  // Step 4 — preference
  const [pref, setPref] = useState<PrefOption>('any');
  const [strictPref, setStrictPref] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back-out draft — resume or start over within the 5-min TTL. Additive: when
  // there's no draft the sheet never renders and the flow is unchanged.
  type BlastDraft = {
    step: number;
    pickup: ValidatedAddress | null;
    dropoff: ValidatedAddress | null;
    tripType: TripType;
    timeOption: TimeOption;
    price: number;
    priceSetByUser: boolean;
    pref: PrefOption;
    strictPref: boolean;
  };
  const { pending: pendingDraft, save: saveDraft, clear: clearDraft, dismiss: dismissDraft } =
    useBookingDraft<BlastDraft>('blast');

  // Persist progress (debounced) once the user has actually started.
  useEffect(() => {
    const started = step > 0 || !!pickup || !!dropoff;
    if (started) {
      saveDraft({ step, pickup, dropoff, tripType, timeOption, price, priceSetByUser, pref, strictPref });
    }
  }, [step, pickup, dropoff, tripType, timeOption, price, priceSetByUser, pref, strictPref, saveDraft]);

  function applyDraft(d: BlastDraft) {
    setStep(d.step);
    setPickup(d.pickup);
    setDropoff(d.dropoff);
    setTripType(d.tripType);
    setTimeOption(d.timeOption);
    setPrice(d.price);
    setPriceSetByUser(d.priceSetByUser);
    setPref(d.pref);
    setStrictPref(d.strictPref);
    dismissDraft();
  }

  // Auto-fetch estimate when both locations are set
  useEffect(() => {
    if (!pickup || !dropoff) return;
    setEstimating(true);
    apiClient<BlastEstimate>('/blast/estimate', null, {
      method: 'POST',
      body: JSON.stringify({
        pickup: { lat: pickup.latitude, lng: pickup.longitude },
        dropoff: { lat: dropoff.latitude, lng: dropoff.longitude },
      }),
    })
      .then(est => {
        setEstimate(est);
        if (!priceSetByUser) {
          setPrice(Math.max(5, Math.round(est.suggested_price_dollars / 5) * 5));
        }
      })
      .catch(() => {})
      .finally(() => setEstimating(false));
  }, [pickup, dropoff]);

  function validateStep(): boolean {
    if (step === 0) return !!pickup && !!dropoff;
    return true;
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
    if (!pickup || !dropoff) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await getToken();
      const driverPreference = pref === 'any'
        ? { preferred: [], strict: false }
        : { preferred: [pref], strict: strictPref };

      const result = await apiClient<{
        blastId: string; shortcode: string; expiresAt: string; targetedCount: number;
      }>('/blast', t, {
        method: 'POST',
        body: JSON.stringify({
          pickup: { lat: pickup.latitude, lng: pickup.longitude, address: pickup.address },
          dropoff: { lat: dropoff.latitude, lng: dropoff.longitude, address: dropoff.address },
          tripType,
          scheduledFor: scheduledFor(timeOption),
          storage: false,
          priceDollars: price,
          driverPreference,
          maxPickupMinutes: null,
          riderGender: null,
        }),
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearDraft();
      router.replace({
        pathname: '/(rider)/book/blast-deck',
        params: {
          blastId: result.blastId,
          shortcode: result.shortcode,
          expiresAt: result.expiresAt,
          targetedCount: String(result.targetedCount),
          price: String(price),
        },
      } as never);
    } catch (e: any) {
      const msg: string = e.message ?? '';
      if (msg.includes('already have an active blast')) {
        setError('You already have an active blast. Cancel it first.');
      } else {
        setError(msg || 'Could not create blast. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const btnLabel = step < TOTAL - 1 ? 'NEXT →' : submitting ? '' : 'BLAST IT →';

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {pendingDraft && (
        <ResumeDraftSheet
          label="blast"
          onResume={() => applyDraft(pendingDraft)}
          onStartOver={clearDraft}
        />
      )}
      <View style={s.header}>
        <TouchableOpacity onPress={back} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>BLAST</Text>
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
            <Text style={s.stepTitle}>WHERE TO?</Text>
            <Text style={s.stepDesc}>Set your pickup and destination — we'll find drivers near you.</Text>
            <View style={[s.card, shadow.card]}>
              <AddressInput label="PICKUP" placeholder="Where are you?" value={pickup} onChange={setPickup} showLocateMe />
            </View>
            <View style={[s.card, shadow.card]}>
              <AddressInput label="DROPOFF" placeholder="Where are you going?" value={dropoff} onChange={setDropoff} />
            </View>
            {estimate && (
              <Animated.View entering={FadeIn.duration(300)} style={s.estimateRow}>
                <Ionicons name="map-outline" size={13} color={colors.textFaint} />
                <Text style={s.estimateText}>
                  {estimate.distance_mi.toFixed(1)} mi · ~{estimate.estimated_minutes} min · suggested ${estimate.suggested_price_dollars}
                </Text>
                {estimating && <ActivityIndicator size="small" color={colors.green} />}
              </Animated.View>
            )}
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View key="s1" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>ONE WAY OR ROUND TRIP?</Text>
            <View style={s.toggleRow}>
              {(['one_way', 'round_trip'] as TripType[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.toggleBtn, tripType === t && s.toggleBtnActive]}
                  onPress={() => { setTripType(t); void Haptics.selectionAsync(); }}
                >
                  <Ionicons
                    name={t === 'one_way' ? 'arrow-forward' : 'repeat'}
                    size={20}
                    color={tripType === t ? colors.green : colors.textFaint}
                  />
                  <Text style={[s.toggleLabel, tripType === t && s.toggleLabelActive]}>
                    {t === 'one_way' ? 'ONE WAY' : 'ROUND TRIP'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {tripType === 'round_trip' && (
              <View style={s.hintBox}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
                <Text style={s.hintText}>Round trip adds return leg to your request. Driver agrees to the full trip.</Text>
              </View>
            )}
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View key="s2" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>WHEN?</Text>
            <View style={s.chipGroup}>
              {TIME_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.chip, timeOption === o.id && s.chipActive]}
                  onPress={() => { setTimeOption(o.id); void Haptics.selectionAsync(); }}
                >
                  <Text style={[s.chipText, timeOption === o.id && s.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {step === 3 && (
          <Animated.View key="s3" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>SET YOUR PRICE</Text>
            <Text style={s.stepDesc}>
              Every driver in your area sees this offer. The higher you go, the faster they pull up.
            </Text>
            <View style={[s.card, shadow.card]}>
              <PriceStepper
                value={price}
                onChange={v => { setPrice(v); setPriceSetByUser(true); }}
                min={5}
                max={500}
                step={5}
              />
            </View>
            <ResponseMeter
              price={price}
              suggested={estimate?.suggested_price_dollars ?? null}
              distanceMi={estimate?.distance_mi ?? null}
              estimatedMins={estimate?.estimated_minutes ?? null}
            />
          </Animated.View>
        )}

        {step === 4 && (
          <Animated.View key="s4" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>DRIVER PREFERENCE</Text>
            <View style={s.chipGroup}>
              {PREF_OPTIONS.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={[s.chip, pref === o.id && s.chipActive]}
                  onPress={() => { setPref(o.id); void Haptics.selectionAsync(); }}
                >
                  <Text style={[s.chipText, pref === o.id && s.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {pref !== 'any' && (
              <Animated.View entering={FadeIn.duration(300)}>
                <TouchableOpacity
                  style={[s.strictRow, strictPref && s.strictRowActive]}
                  onPress={() => { setStrictPref(v => !v); void Haptics.selectionAsync(); }}
                >
                  <View style={[s.checkbox, strictPref && s.checkboxActive]}>
                    {strictPref && <Ionicons name="checkmark" size={12} color={colors.bg} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.strictLabel}>STRICT PREFERENCE</Text>
                    <Text style={s.strictDesc}>Only match with {pref} drivers. Fewer options but filtered.</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}

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
          style={[s.nextBtn, (!validateStep() || submitting) && s.nextBtnDisabled]}
          onPress={advance}
          disabled={!validateStep() || submitting}
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

// ── Response meter ────────────────────────────────────────────────────────────

const TIERS = [
  { maxAbove: -1,  label: 'BELOW BASE',  color: colors.red,          desc: "Fewer drivers respond below the estimated price." },
  { maxAbove: 0,   label: 'BASE',        color: colors.textTertiary, desc: "Standard rate — you'll see a few offers." },
  { maxAbove: 5,   label: 'SOLID',       color: colors.amber,        desc: "A bit above base — above average response rate." },
  { maxAbove: 10,  label: 'GOOD',        color: colors.amber,        desc: "You'll get multiple offers at this price." },
  { maxAbove: 20,  label: 'STRONG',      color: colors.green,        desc: "Drivers will prioritize your blast over others." },
  { maxAbove: Infinity, label: 'TOP OFFER', color: colors.green,     desc: "Maximum response rate — drivers racing to HMU you." },
];

function ResponseMeter({ price, suggested, distanceMi, estimatedMins }: {
  price: number;
  suggested: number | null;
  distanceMi: number | null;
  estimatedMins: number | null;
}) {
  const [trackW, setTrackW] = useState(0);
  const fillAnim = useSharedValue(0);
  const fillStyle = useAnimatedStyle(() => ({ width: fillAnim.value }));

  const base = suggested ?? price;
  const diff = price - base;
  const tier = TIERS.find(t => diff <= t.maxAbove) ?? TIERS[TIERS.length - 1];

  // Fill 100% at 1.6× the base price
  const maxPrice = base * 1.6;
  const fillRatio = Math.min(Math.max(price / maxPrice, 0.04), 1);
  const baseRatio = Math.min(base / maxPrice, 0.98);

  useEffect(() => {
    if (trackW > 0) {
      fillAnim.value = withTiming(fillRatio * trackW, { duration: 380 });
    }
  }, [fillRatio, trackW]);

  return (
    <View style={rm.wrap}>
      {/* Route context */}
      {(distanceMi != null || estimatedMins != null) && (
        <View style={rm.routeRow}>
          <Ionicons name="map-outline" size={12} color={colors.textFaint} />
          <Text style={rm.routeText}>
            {[
              distanceMi != null && `${distanceMi.toFixed(1)} mi`,
              estimatedMins != null && `~${estimatedMins} min`,
              suggested != null && `base $${suggested}`,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
      )}

      {/* Label row */}
      <View style={rm.labelRow}>
        <Text style={rm.meterLabel}>RESPONSE RATE</Text>
        <Text style={[rm.tierLabel, { color: tier.color }]}>{tier.label}</Text>
      </View>

      {/* Animated bar */}
      <View
        style={rm.track}
        onLayout={e => setTrackW(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[rm.fill, fillStyle, { backgroundColor: tier.color }]} />
        {/* Base price marker line */}
        {trackW > 0 && suggested != null && (
          <View style={[rm.baseMark, { left: baseRatio * trackW - 1 }]} />
        )}
      </View>

      {/* Dynamic motivational copy */}
      <Animated.Text
        key={tier.label}
        entering={FadeIn.duration(250)}
        style={[rm.desc, { color: tier.color === colors.textTertiary ? colors.textTertiary : tier.color }]}
      >
        {tier.desc}
      </Animated.Text>
    </View>
  );
}

const rm = StyleSheet.create({
  wrap: { gap: spacing.sm },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  routeText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 0.5 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meterLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },
  tierLabel: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 1 },
  track: {
    height: 6, backgroundColor: colors.cardAlt,
    borderRadius: 3, overflow: 'hidden', position: 'relative',
  },
  fill: {
    position: 'absolute', top: 0, left: 0, bottom: 0,
    borderRadius: 3,
  },
  baseMark: {
    position: 'absolute', top: -3, bottom: -3,
    width: 2, backgroundColor: colors.textFaint,
    borderRadius: 1,
  },
  desc: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
});

// ─────────────────────────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === current ? 16 : 6,
            height: 4,
            borderRadius: 2,
            backgroundColor: i === current ? colors.green : colors.border,
          }}
        />
      ))}
    </View>
  );
}

function PriceStepper({ value, onChange, min, max, step }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step: number;
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
        <Text style={ps.dollar}>$</Text>
        <Text style={ps.value}>{value}</Text>
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
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.green, letterSpacing: 2 },

  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg },
  stepWrap: { gap: spacing.lg },
  stepTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.textPrimary },
  stepDesc: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 22, marginTop: -spacing.sm },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: colors.border,
  },

  estimateRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  estimateText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, flex: 1 },

  toggleRow: { flexDirection: 'row', gap: spacing.md },
  toggleBtn: {
    flex: 1, paddingVertical: spacing.xl, borderRadius: radius.card,
    alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  toggleBtnActive: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  toggleLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
  toggleLabelActive: { color: colors.green },

  chipGroup: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1, paddingVertical: 12, borderRadius: radius.pill,
    alignItems: 'center', backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  chipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1 },
  chipTextActive: { color: colors.green },

  strictRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  strictRowActive: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxActive: { backgroundColor: colors.green, borderColor: colors.green },
  strictLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary, letterSpacing: 1 },
  strictDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 18, marginTop: 2 },

  hintBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  hintText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, lineHeight: 18 },

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
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 2 },
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
  dollar: { fontFamily: fonts.display, fontSize: 22, color: colors.textTertiary },
  value: { fontFamily: fonts.display, fontSize: 44, color: colors.textPrimary },
});
