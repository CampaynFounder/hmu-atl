// Driver express onboarding wizard — mobile.
// Config-driven: reads GET /api/onboarding/driver-express-config (same endpoint as web).
// Saves via POST /api/users/onboarding.
// Payout step: POST /api/driver/stripe/onboarding-link → WebBrowser (Stripe Express).

import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { AvatarMediaPicker, type CapturedMedia } from '@/components/AvatarMediaPicker';

WebBrowser.maybeCompleteAuthSession();

// ─── Types (mirrored from lib/onboarding/config.ts — web-only package) ────────

type FieldVisibility = 'required' | 'optional' | 'hidden' | 'deferred';

interface PricingTier {
  label: string; min: number; rate30: number; rate1h: number; rate2h: number; default?: boolean;
}

interface DriverExpressConfig {
  enabled: boolean;
  fields: {
    govName: FieldVisibility; licensePlate: FieldVisibility; vehicleMakeModel: FieldVisibility;
    vehicleYear: FieldVisibility; seatMap: FieldVisibility; videoIntro: FieldVisibility;
    adPhoto: FieldVisibility; riderPreferences: FieldVisibility; location: FieldVisibility; areas: FieldVisibility;
  };
  pricingTiers: PricingTier[];
  stopsFee: number; waitPerMin: number;
  scheduleDefault: { days: string[]; start: string; end: string; noticeRequired: string };
}

interface MarketArea { slug: string; name: string; cardinal: string }

interface PayoutStatus {
  setupComplete: boolean; stripeComplete: boolean; nextStep: string;
  stripeAccount: { last4: string | null; bank: string | null } | null;
  payoutMode?: 'embedded' | 'native';
}

const DEFAULTS: DriverExpressConfig = {
  enabled: true,
  fields: {
    govName: 'deferred', licensePlate: 'deferred', vehicleMakeModel: 'required',
    vehicleYear: 'optional', seatMap: 'required', videoIntro: 'deferred',
    adPhoto: 'deferred', riderPreferences: 'deferred', location: 'deferred', areas: 'hidden',
  },
  pricingTiers: [
    { label: '$10', min: 10, rate30: 15, rate1h: 25, rate2h: 45 },
    { label: '$25', min: 25, rate30: 25, rate1h: 40, rate2h: 70, default: true },
    { label: '$50', min: 50, rate30: 50, rate1h: 75, rate2h: 125 },
  ],
  stopsFee: 5, waitPerMin: 1,
  scheduleDefault: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], start: '07:00', end: '22:00', noticeRequired: '30min' },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function pickDefaultTier(tiers: PricingTier[]): PricingTier {
  return tiers.find(t => t.default) ?? tiers[Math.floor(tiers.length / 2)] ?? tiers[0];
}

function pricingFromTier(tier: PricingTier, stopsFee: number) {
  return { minimum: tier.min, base_rate: tier.rate30, hourly: tier.rate1h, two_hour: tier.rate2h, out_of_town: tier.rate1h + 10, round_trip: false, stops_fee: stopsFee };
}

const DAY_MAP: Record<string, string> = {
  mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday',
};

function scheduleFromDefault(def: DriverExpressConfig['scheduleDefault']): Record<string, { available: boolean }> {
  const out: Record<string, { available: boolean }> = {};
  for (const code of def.days) { const n = DAY_MAP[code]; if (n) out[n] = { available: true }; }
  return out;
}

function noticeHoursFromString(notice: string): number {
  const m = String(notice || '').toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(min|hr|h|hour|hours)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n <= 0) return 0;
  return m[2]?.startsWith('h') ? Math.ceil(n) : Math.ceil(n / 60);
}

// ─── Form + Phase ─────────────────────────────────────────────────────────────

interface FormData {
  displayName: string; gender: string;
  vehicleMake: string; vehicleModel: string; vehicleYear: string; maxSeats: number;
  pricingTier: PricingTier; areaSlugs: string[]; servicesEntireMarket: boolean;
  licensePlate: string; plateState: string;
}

type WizardPhase = 'wizard' | 'payout' | 'done';

interface WizardStep {
  id: string; title: string; subtitle: string;
  content: () => React.ReactNode;
  isValid: () => boolean; optional: boolean;
}

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DriverOnboarding() {
  const insets = useSafeAreaInsets();
  const getToken = useStableToken();
  const router = useRouter();

  const [config, setConfig] = useState<DriverExpressConfig>(DEFAULTS);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [marketAreas, setMarketAreas] = useState<MarketArea[]>([]);
  const [marketName, setMarketName] = useState('ATL');

  const [phase, setPhase] = useState<WizardPhase>('wizard');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [media, setMedia] = useState<CapturedMedia | null>(null);

  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus | null>(null);
  const [openingPayout, setOpeningPayout] = useState(false);

  const [form, setForm] = useState<FormData>({
    displayName: '', gender: '',
    vehicleMake: '', vehicleModel: '', vehicleYear: '', maxSeats: 4,
    pricingTier: pickDefaultTier(DEFAULTS.pricingTiers),
    areaSlugs: [], servicesEntireMarket: true,
    licensePlate: '', plateState: 'GA',
  });

  const update = (patch: Partial<FormData>) => setForm(prev => ({ ...prev, ...patch }));
  const inFlow = (v: FieldVisibility) => v === 'required' || v === 'optional';

  // Load config from admin
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await getToken();
        const res = await apiClient<{ config: DriverExpressConfig; market: { slug: string; name: string }; marketAreas: MarketArea[] }>(
          '/onboarding/driver-express-config', t,
        );
        if (!cancelled) {
          setConfig(res.config);
          update({ pricingTier: pickDefaultTier(res.config.pricingTiers) });
          if (res.market?.name) setMarketName(res.market.name);
          if (Array.isArray(res.marketAreas)) setMarketAreas(res.marketAreas);
        }
      } catch { /* use defaults */ }
      finally { if (!cancelled) setConfigLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build steps from config
  const steps: WizardStep[] = [];

  steps.push({
    id: 'handle',
    title: 'PICK YOUR HANDLE',
    subtitle: 'What riders see. Letters, numbers, underscores. 2–20 chars.',
    content: () => (
      <View style={s.stepContent}>
        <TextInput
          style={s.input}
          value={form.displayName}
          onChangeText={v => update({ displayName: v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) })}
          placeholder="your_handle"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        <Text style={s.hint}>{form.displayName.length}/20 characters</Text>
        <Text style={s.fieldLabel}>GENDER</Text>
        <View style={s.pillRow}>
          {GENDERS.map(g => (
            <TouchableOpacity
              key={g.value}
              style={[s.pill, form.gender === g.value && s.pillActive]}
              onPress={() => update({ gender: g.value })}
            >
              <Text style={[s.pillText, form.gender === g.value && s.pillTextActive]}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    ),
    isValid: () => form.displayName.trim().length >= 2 && form.gender !== '',
    optional: false,
  });

  // Profile photo OR video → driver avatar (thumbnail_url). Shown when admin
  // has adPhoto or videoIntro in-flow; enforced when either is required.
  const mediaInFlow = inFlow(config.fields.adPhoto) || inFlow(config.fields.videoIntro);
  const mediaRequired = config.fields.adPhoto === 'required' || config.fields.videoIntro === 'required';
  if (mediaInFlow) {
    steps.push({
      id: 'media',
      title: 'ADD YOUR PHOTO OR VIDEO',
      subtitle: "This is your profile picture — what riders see when you pull up.",
      content: () => (
        <View style={s.stepContent}>
          <AvatarMediaPicker profileType="driver" value={media} onChange={setMedia} />
        </View>
      ),
      isValid: () => !mediaRequired || !!media,
      optional: !mediaRequired,
    });
  }

  if (config.fields.vehicleMakeModel !== 'hidden') {
    steps.push({
      id: 'vehicle',
      title: 'YOUR RIDE',
      subtitle: "Tell riders what they're getting into.",
      content: () => (
        <View style={s.stepContent}>
          <Text style={s.fieldLabel}>MAKE</Text>
          <TextInput style={s.input} value={form.vehicleMake} onChangeText={v => update({ vehicleMake: v })} placeholder="Toyota" placeholderTextColor={colors.textFaint} autoCapitalize="words" />
          <Text style={s.fieldLabel}>MODEL</Text>
          <TextInput style={s.input} value={form.vehicleModel} onChangeText={v => update({ vehicleModel: v })} placeholder="Camry" placeholderTextColor={colors.textFaint} autoCapitalize="words" />
          {config.fields.vehicleYear !== 'hidden' && (
            <>
              <Text style={s.fieldLabel}>YEAR{config.fields.vehicleYear === 'optional' ? ' (optional)' : ''}</Text>
              <TextInput style={s.input} value={form.vehicleYear} onChangeText={v => update({ vehicleYear: v.replace(/\D/g, '').slice(0, 4) })} placeholder="2020" placeholderTextColor={colors.textFaint} keyboardType="number-pad" maxLength={4} />
            </>
          )}
          {config.fields.seatMap !== 'hidden' && (
            <>
              <Text style={s.fieldLabel}>PASSENGER SEATS</Text>
              <View style={s.counterRow}>
                <TouchableOpacity style={s.counterBtn} onPress={() => update({ maxSeats: Math.max(1, form.maxSeats - 1) })}>
                  <Ionicons name="remove" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={s.counterVal}>{form.maxSeats}</Text>
                <TouchableOpacity style={s.counterBtn} onPress={() => update({ maxSeats: Math.min(7, form.maxSeats + 1) })}>
                  <Ionicons name="add" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ),
      isValid: () => {
        if (!form.vehicleMake.trim() || !form.vehicleModel.trim()) return false;
        if (config.fields.vehicleYear === 'required' && !form.vehicleYear.trim()) return false;
        return true;
      },
      optional: config.fields.vehicleMakeModel === 'optional',
    });
  }

  steps.push({
    id: 'pricing',
    title: 'SET YOUR MINIMUM',
    subtitle: "We'll auto-fill the rest. Tweak from your profile later.",
    content: () => (
      <View style={s.stepContent}>
        {config.pricingTiers.map(tier => {
          const sel = form.pricingTier.min === tier.min;
          return (
            <TouchableOpacity key={tier.min} style={[s.tierCard, sel && s.tierCardActive]} onPress={() => update({ pricingTier: tier })} activeOpacity={0.8}>
              <View style={s.tierTop}>
                <Text style={[s.tierLabel, sel && { color: colors.green }]}>{tier.label} MIN</Text>
                {sel && <Ionicons name="checkmark-circle" size={18} color={colors.green} />}
              </View>
              <View style={s.tierRates}>
                <Text style={s.tierRate}>${tier.rate30} / 30 min</Text>
                <Text style={s.tierRate}>${tier.rate1h} / hr</Text>
                <Text style={s.tierRate}>${tier.rate2h} / 2 hr</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={s.hint}>Stops: +${config.stopsFee} · Wait: ${config.waitPerMin}/min</Text>
      </View>
    ),
    isValid: () => true,
    optional: false,
  });

  if (inFlow(config.fields.areas)) {
    steps.push({
      id: 'areas',
      title: 'WHERE YOU DRIVE',
      subtitle: `Pick areas in ${marketName}, or drive anywhere.`,
      content: () => (
        <View style={s.stepContent}>
          <View style={s.toggleRow}>
            <Text style={s.toggleLabel}>Anywhere in {marketName}</Text>
            <Switch
              value={form.servicesEntireMarket}
              onValueChange={v => update({ servicesEntireMarket: v, areaSlugs: v ? [] : form.areaSlugs })}
              trackColor={{ false: colors.border, true: colors.greenBorder }}
              thumbColor={form.servicesEntireMarket ? colors.green : colors.textFaint}
            />
          </View>
          {!form.servicesEntireMarket && marketAreas.length > 0 && (
            <View style={s.chipGrid}>
              {marketAreas.map(area => {
                const sel = form.areaSlugs.includes(area.slug);
                return (
                  <TouchableOpacity
                    key={area.slug}
                    style={[s.chip, sel && s.chipActive]}
                    onPress={() => update({ areaSlugs: sel ? form.areaSlugs.filter(s => s !== area.slug) : [...form.areaSlugs, area.slug] })}
                  >
                    <Text style={[s.chipText, sel && s.chipTextActive]}>{area.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      ),
      isValid: () => form.servicesEntireMarket || form.areaSlugs.length > 0,
      optional: config.fields.areas === 'optional',
    });
  }

  if (inFlow(config.fields.licensePlate)) {
    steps.push({
      id: 'license-plate',
      title: 'YOUR PLATE',
      subtitle: 'Riders use this to spot you at pickup.',
      content: () => (
        <View style={s.stepContent}>
          <TextInput
            style={[s.input, s.plateInput]}
            value={form.licensePlate}
            onChangeText={v => update({ licensePlate: v.toUpperCase().replace(/[^A-Z0-9 \-]/g, '').slice(0, 8) })}
            placeholder="ABC 1234"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            maxLength={8}
          />
        </View>
      ),
      isValid: () => config.fields.licensePlate === 'required' ? form.licensePlate.trim().length > 0 : true,
      optional: config.fields.licensePlate === 'optional',
    });
  }

  const cur = steps[step];
  const isLast = step === steps.length - 1;
  const canProceed = cur?.isValid() ?? false;

  async function handleNext() {
    if (!cur || saving) return;
    if (isLast) {
      setSaving(true);
      setSaveError(null);
      try {
        const t = await getToken();
        await apiClient('/users/onboarding', t, {
          method: 'POST',
          body: JSON.stringify({
            profile_type: 'driver',
            display_name: form.displayName.trim(),
            gender: form.gender,
            vehicle_info: config.fields.vehicleMakeModel !== 'hidden' ? {
              make: form.vehicleMake.trim(),
              model: form.vehicleModel.trim(),
              year: form.vehicleYear.trim() || undefined,
              allowed_seats: Array.from({ length: form.maxSeats }, (_, i) => i + 1),
              max_adults: form.maxSeats,
              has_third_row: false,
            } : undefined,
            pricing: pricingFromTier(form.pricingTier, config.stopsFee),
            schedule: scheduleFromDefault(config.scheduleDefault),
            advance_notice_hours: noticeHoursFromString(config.scheduleDefault.noticeRequired),
            services_entire_market: form.servicesEntireMarket,
            area_slugs: form.areaSlugs,
            accepts_long_distance: false,
            license_plate: form.licensePlate.trim() || undefined,
            plate_state: form.licensePlate.trim() ? form.plateState : undefined,
            // Captured photo/video → driver avatar (thumbnail_url) + ad photo / intro video.
            ...(media ? {
              thumbnail_url: media.url,
              ...(media.isVideo ? { video_url: media.url } : { ad_photo_url: media.url }),
            } : {}),
          }),
        });
        setPhase('payout');
        void loadPayoutStatus();
      } catch (e: any) {
        setSaveError(e?.message ?? 'Setup failed. Try again.');
      } finally {
        setSaving(false);
      }
    } else {
      setStep(s => s + 1);
    }
  }

  async function loadPayoutStatus() {
    try {
      const t = await getToken();
      const data = await apiClient<PayoutStatus>('/driver/payout-setup', t);
      setPayoutStatus(data);
    } catch { /* non-critical */ }
  }

  async function openPayout() {
    // Default: in-app embedded onboarding (no external browser). The screen
    // celebrates on completion and returns here; the payout-phase focus effect
    // reloads status so this step flips to done.
    if ((payoutStatus?.payoutMode ?? 'embedded') === 'embedded') {
      router.push('/(driver)/payout-embedded' as never);
      return;
    }
    // payoutMode === 'native' (Option B) — native flow not in this build yet;
    // fall back to the hosted browser link.
    setOpeningPayout(true);
    try {
      const t = await getToken();
      const { url } = await apiClient<{ url: string }>('/driver/stripe/onboarding-link', t, { method: 'POST' });
      const result = await WebBrowser.openAuthSessionAsync(url, 'hmuatl://');
      if (result.type === 'success' || result.type === 'dismiss') void loadPayoutStatus();
    } catch (e: any) {
      console.warn('[onboarding] payout error:', e?.message);
    } finally {
      setOpeningPayout(false);
    }
  }

  // Reload payout status when the payout phase regains focus (e.g. returning
  // from the in-app embedded onboarding screen) so this step flips to done.
  useFocusEffect(
    useCallback(() => {
      if (phase === 'payout') void loadPayoutStatus();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]),
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!configLoaded) {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  // ── Payout phase ──────────────────────────────────────────────────────────
  if (phase === 'payout') {
    const done = payoutStatus?.setupComplete;
    return (
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={s.payoutHeader}>
          <Text style={s.payoutStep}>LAST STEP</Text>
          <Text style={s.payoutTitle}>LINK YOUR PAYOUT</Text>
          <Text style={s.payoutBody}>Connect your bank or debit card. You only get paid if Stripe can send you money.</Text>
        </View>

        <View style={[s.payoutCard, shadow.card, done && s.payoutCardDone]}>
          {done ? (
            <Animated.View entering={FadeIn} style={s.payoutDoneRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.green} />
              <View style={{ flex: 1 }}>
                <Text style={s.payoutDoneLabel}>Payout account connected</Text>
                {payoutStatus?.stripeAccount?.bank && (
                  <Text style={s.payoutDoneSub}>{payoutStatus.stripeAccount.bank} ···{payoutStatus.stripeAccount.last4}</Text>
                )}
              </View>
            </Animated.View>
          ) : (
            <View style={s.payoutCardInner}>
              <Ionicons name="card-outline" size={28} color={colors.textFaint} />
              <Text style={s.payoutCardTitle}>Stripe Connect</Text>
              <Text style={s.payoutCardBody}>Bank or debit card. Secure. Takes ~2 minutes.</Text>
              <TouchableOpacity style={s.payoutBtn} onPress={openPayout} disabled={openingPayout} activeOpacity={0.85}>
                {openingPayout ? <ActivityIndicator color={colors.bg} /> : <Text style={s.payoutBtnText}>SET UP PAYOUTS</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={s.payoutFooter}>
          <TouchableOpacity
            style={[s.nextBtn, { marginBottom: spacing.md }]}
            onPress={() => setPhase('done')}
            activeOpacity={0.85}
          >
            <Text style={s.nextBtnText}>{done ? "I'M READY TO DRIVE" : "SKIP FOR NOW"}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.bg} />
          </TouchableOpacity>
          {!done && (
            <Text style={s.payoutSkipNote}>You can link your payout anytime from Profile → Payout Setup.</Text>
          )}
        </View>
      </View>
    );
  }

  // ── Done phase ────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <View style={[s.root, s.center, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl, padding: spacing.xl }]}>
        <Animated.View entering={ZoomIn.duration(400)} style={s.doneIconWrap}>
          <Ionicons name="rocket" size={48} color={colors.green} />
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(200)} style={s.doneTitle}>YOU'RE LIVE,{'\n'}@{form.displayName}</Animated.Text>
        <Animated.Text entering={FadeIn.delay(350)} style={s.doneBody}>
          Minimum ${form.pricingTier.min} · {form.servicesEntireMarket ? `All of ${marketName}` : `${form.areaSlugs.length} area${form.areaSlugs.length !== 1 ? 's' : ''}`}
        </Animated.Text>
        <Animated.View entering={FadeIn.delay(500)} style={{ width: '100%', marginTop: spacing.xl }}>
          <TouchableOpacity style={s.nextBtn} onPress={() => router.replace('/(driver)/home' as any)} activeOpacity={0.85}>
            <Text style={s.nextBtnText}>GO TO DASHBOARD</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.bg} />
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Header: back + progress */}
        <View style={s.wizHeader}>
          <TouchableOpacity style={[s.backBtn, step === 0 && { opacity: 0 }]} onPress={() => step > 0 && setStep(s => s - 1)} disabled={step === 0} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.dotsWrap}>
            {steps.map((_, i) => (
              <View key={i} style={[s.dot, i === step && s.dotActive, i < step && s.dotDone]} />
            ))}
          </View>
          <Text style={s.stepCounter}>{step + 1}/{steps.length}</Text>
        </View>

        {/* Content */}
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.stepTitle}>{cur?.title}</Text>
          <Text style={s.stepSubtitle}>{cur?.subtitle}</Text>
          {cur?.content()}

          {saveError && (
            <View style={s.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
              <Text style={s.errorText}>{saveError}</Text>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {cur?.optional && !isLast && (
            <TouchableOpacity onPress={() => setStep(s => s + 1)} style={s.skipBtn}>
              <Text style={s.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.nextBtn, (!canProceed || saving) && s.nextBtnDisabled]}
            onPress={handleNext}
            disabled={!canProceed || saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color={colors.bg} /> : (
              <>
                <Text style={s.nextBtnText}>{isLast ? 'FINISH & LINK PAYOUT' : 'CONTINUE'}</Text>
                <Ionicons name={isLast ? 'rocket-outline' : 'arrow-forward'} size={16} color={colors.bg} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },

  wizHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dotsWrap: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.green },
  dotDone: { backgroundColor: colors.greenBorder },
  stepCounter: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, width: 36, textAlign: 'right' },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.xl, paddingBottom: 48 },

  stepTitle: { fontFamily: fonts.display, fontSize: 34, color: colors.textPrimary, marginBottom: spacing.xs },
  stepSubtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 21, marginBottom: spacing.xl },

  stepContent: { gap: spacing.md },
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5, marginTop: spacing.sm },

  input: {
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    fontFamily: fonts.body, fontSize: 16, color: colors.textPrimary,
  },
  plateInput: { fontFamily: fonts.mono, fontSize: 22, letterSpacing: 4, textAlign: 'center' },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pillActive: { borderColor: colors.green, backgroundColor: colors.greenDim },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textTertiary },
  pillTextActive: { color: colors.green },

  counterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  counterBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  counterVal: { fontFamily: fonts.display, fontSize: 36, color: colors.textPrimary, width: 44, textAlign: 'center' },

  tierCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
  },
  tierCardActive: { borderColor: colors.green, backgroundColor: colors.greenDim },
  tierTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  tierLabel: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary },
  tierRates: { flexDirection: 'row', gap: spacing.md },
  tierRate: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: radius.cardInner, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  toggleLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.tag, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipActive: { borderColor: colors.green, backgroundColor: colors.greenDim },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textTertiary },
  chipTextActive: { color: colors.green },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.redDim, borderRadius: radius.tag, padding: spacing.md, borderWidth: 1, borderColor: colors.redBorder, marginTop: spacing.md },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.red },

  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.xs },
  skipText: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.green, borderRadius: radius.pill, paddingVertical: 16 },
  nextBtnDisabled: { opacity: 0.35 },
  nextBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.2 },

  // Payout phase
  payoutHeader: { padding: spacing.xl, paddingBottom: spacing.lg },
  payoutStep: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 2, marginBottom: spacing.xs },
  payoutTitle: { fontFamily: fonts.display, fontSize: 36, color: colors.textPrimary, marginBottom: spacing.sm },
  payoutBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 22 },
  payoutCard: { marginHorizontal: spacing.xl, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden' },
  payoutCardDone: { borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  payoutCardInner: { padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  payoutCardTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary },
  payoutCardBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center' },
  payoutDoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  payoutDoneLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.green },
  payoutDoneSub: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  payoutBtn: { backgroundColor: colors.green, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: spacing.xxl, alignItems: 'center', width: '100%' },
  payoutBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1 },
  payoutFooter: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.xl },
  payoutSkipNote: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center' },

  // Done phase
  doneIconWrap: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  doneTitle: { fontFamily: fonts.display, fontSize: 40, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  doneBody: { fontFamily: fonts.body, fontSize: 15, color: colors.textTertiary, textAlign: 'center' },
});
