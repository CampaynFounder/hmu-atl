// Direct Booking — rider targets a specific driver by handle.
// 3-step wizard: (1) find driver → (2) pickup + dropoff → (3) when + price
// POST /api/drivers/{handle}/book → waiting screen with 15-min countdown.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
  TextInput, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient, API_BASE } from '@/lib/api';
import { AddressInput, ValidatedAddress } from '@/components/AddressInput';

interface DriverPreview {
  handle: string;
  display_name: string | null;
  thumbnail_url: string | null;
  tier: string;
  completed_rides: number;
  chill_score: number | null;
  accepts_cash: boolean;
}

interface BrowseResult {
  handle: string;
  displayName: string;
  photoUrl: string | null;
  minPrice: number;
  areas: string[];
  chillScore: number;
  isHmuFirst: boolean;
  vehicleSummary: { label: string; maxRiders: number | null } | null;
}

const TIME_PRESETS = [
  { label: 'NOW', value: 'now' },
  { label: 'TONIGHT', value: 'tonight' },
  { label: 'TOMORROW', value: 'tomorrow' },
] as const;

function resolveScheduledTime(preset: string, customText: string): { resolvedTime: string | null; timeDisplay: string; isNow: boolean } {
  if (preset === 'now') return { resolvedTime: null, timeDisplay: 'Now', isNow: true };
  if (preset === 'tonight') {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    if (d <= new Date()) d.setDate(d.getDate() + 1);
    return { resolvedTime: d.toISOString(), timeDisplay: 'Tonight 9 PM', isNow: false };
  }
  if (preset === 'tomorrow') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return { resolvedTime: d.toISOString(), timeDisplay: 'Tomorrow 10 AM', isNow: false };
  }
  return { resolvedTime: null, timeDisplay: customText || 'Now', isNow: !customText };
}

export default function DirectBooking() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const { prefillHandle } = useLocalSearchParams<{ prefillHandle?: string }>();

  const [step, setStep] = useState(0);

  // Step 1 — driver
  const [handleInput, setHandleInput] = useState(prefillHandle ?? '');
  const [driver, setDriver] = useState<DriverPreview | null>(null);
  const [findingDriver, setFindingDriver] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);

  // Search index — loaded once, filtered client-side as user types
  const [browseIndex, setBrowseIndex] = useState<BrowseResult[]>([]);
  const [searchResults, setSearchResults] = useState<BrowseResult[]>([]);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function loadIndex() {
      try {
        const t = await getToken();
        const data = await apiClient<{ drivers: BrowseResult[] }>(
          '/rider/browse/list?offset=0&limit=60', t,
        );
        setBrowseIndex(data.drivers ?? []);
      } catch {}
    }
    void loadIndex();
  }, [getToken]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = handleInput.trim().toLowerCase().replace(/^@/, '');
    if (q.length < 2 || driver) { setSearchResults([]); return; }
    searchDebounce.current = setTimeout(() => {
      const matches = browseIndex
        .filter(d =>
          d.handle.toLowerCase().includes(q) ||
          d.displayName.toLowerCase().includes(q),
        )
        .slice(0, 7);
      setSearchResults(matches);
    }, 120);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [handleInput, browseIndex, driver]);

  // Step 2 — locations
  const [pickup, setPickup] = useState<ValidatedAddress | null>(null);
  const [dropoff, setDropoff] = useState<ValidatedAddress | null>(null);

  // Step 3 — when + price
  const [timePreset, setTimePreset] = useState<string>('now');
  const [price, setPrice] = useState(25);
  const [isCash, setIsCash] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findDriver = useCallback(async (overrideHandle?: string) => {
    const h = (overrideHandle ?? handleInput).trim().replace(/^@/, '');
    if (!h) return;
    setFindingDriver(true);
    setDriverError(null);
    setDriver(null);
    setSearchResults([]);
    try {
      const t = await getToken();
      const d = await apiClient<DriverPreview>(`/driver/${h}`, t);
      setDriver(d);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setDriverError('Driver not found. Check the handle and try again.');
    } finally {
      setFindingDriver(false);
    }
  }, [handleInput, getToken]);

  // Auto-lookup when arriving from Browse with a pre-filled handle
  useEffect(() => {
    if (prefillHandle) void findDriver(prefillHandle);
  }, []);

  function validateStep(): boolean {
    if (step === 0) return !!driver;
    if (step === 1) return !!pickup && !!dropoff;
    return price >= 1;
  }

  async function advance() {
    if (!validateStep()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (step < 2) {
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
    if (!driver || !pickup || !dropoff) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await getToken();
      const { resolvedTime, timeDisplay, isNow } = resolveScheduledTime(timePreset, '');
      const { postId, expiresAt, expiryMinutes } = await apiClient<{
        postId: string; expiresAt: string; expiryMinutes: number;
      }>(
        `/drivers/${driver.handle}/book`,
        t,
        {
          method: 'POST',
          body: JSON.stringify({
            price,
            is_cash: isCash,
            timeWindow: {
              destination: dropoff.address,
              pickup: pickup.address,
              dropoff: dropoff.address,
              time: isNow ? 'now' : timeDisplay,
              resolvedTime,
              isNow,
              estimated_minutes: 30,
            },
          }),
        },
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: '/(rider)/book/waiting',
        params: {
          type: 'direct',
          postId,
          expiresAt,
          expiryMinutes: String(expiryMinutes),
          handle: driver.handle,
          price: String(price),
        },
      } as never);
    } catch (e: any) {
      const msg: string = e.message ?? '';
      if (msg.includes('ACTIVE_BLAST_EXISTS')) setError('Cancel your active blast first.');
      else if (msg.includes('TIME_WINDOW_CONFLICT')) setError('You already have a request for this time window.');
      else setError(msg || 'Booking failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const btnLabel = step < 2
    ? 'NEXT →'
    : submitting ? '' : `CONFIRM BOOKING — $${price}`;

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={back} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>DIRECT BOOKING</Text>
          <StepDots total={3} current={step} color={colors.blue} />
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
            <Text style={s.stepTitle}>WHO DO YOU WANT?</Text>
            <Text style={s.stepDesc}>
              Enter a driver's handle to pull up on them directly. They'll get 15 minutes to accept.
            </Text>

            <View style={s.handleRow}>
              <Text style={s.atSign}>@</Text>
              <TextInput
                style={s.handleInput}
                placeholder="search by name or handle"
                placeholderTextColor={colors.textFaint}
                value={handleInput}
                onChangeText={v => { setHandleInput(v); setDriver(null); setDriverError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => findDriver()}
              />
              <TouchableOpacity
                style={[s.findBtn, (!handleInput.trim() || findingDriver) && { opacity: 0.4 }]}
                onPress={() => findDriver()}
                disabled={!handleInput.trim() || findingDriver}
              >
                {findingDriver
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Text style={s.findBtnText}>GO</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Live search results */}
            {searchResults.length > 0 && (
              <Animated.View entering={FadeIn.duration(200)} style={s.resultsList}>
                {searchResults.map((r, i) => (
                  <TouchableOpacity
                    key={r.handle}
                    style={[s.resultRow, i === searchResults.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => { setHandleInput(r.handle); void findDriver(r.handle); void Haptics.selectionAsync(); }}
                    activeOpacity={0.7}
                  >
                    {/* Avatar / photo */}
                    {r.photoUrl ? (
                      <Image source={{ uri: r.photoUrl }} style={s.resultAvatar} />
                    ) : (
                      <View style={[s.resultAvatar, s.resultAvatarFallback]}>
                        <Text style={s.resultAvatarLetter}>
                          {(r.displayName || r.handle)[0]?.toUpperCase()}
                        </Text>
                      </View>
                    )}

                    {/* Info */}
                    <View style={s.resultInfo}>
                      <Text style={s.resultName} numberOfLines={1}>
                        {r.displayName || `@${r.handle}`}
                      </Text>
                      <View style={s.resultMeta}>
                        <Text style={s.resultHandle}>@{r.handle}</Text>
                        {r.areas.length > 0 && (
                          <Text style={s.resultArea} numberOfLines={1}>
                            · {r.areas.slice(0, 2).join(', ')}
                          </Text>
                        )}
                      </View>
                    </View>

                    {/* Price + tier */}
                    <View style={s.resultRight}>
                      <Text style={s.resultPrice}>${r.minPrice}</Text>
                      {r.isHmuFirst && (
                        <View style={s.resultTierBadge}>
                          <Text style={s.resultTierText}>1ST</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}

            {driverError && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.red} />
                <Text style={s.errorText}>{driverError}</Text>
              </View>
            )}

            {driver && (
              <Animated.View entering={FadeIn.duration(350)} style={[s.driverCard, shadow.card]}>
                <View style={[s.driverAvatar, { backgroundColor: colors.blueDim, borderColor: colors.blueBorder }]}>
                  <Text style={[s.driverAvatarLetter, { color: colors.blue }]}>
                    {(driver.display_name ?? driver.handle)[0]?.toUpperCase()}
                  </Text>
                </View>
                <View style={s.driverInfo}>
                  <Text style={s.driverHandle}>@{driver.handle}</Text>
                  {driver.display_name && (
                    <Text style={s.driverName}>{driver.display_name}</Text>
                  )}
                  <View style={s.driverStats}>
                    <Text style={s.driverStat}>{driver.completed_rides} rides</Text>
                    {driver.tier === 'hmu_first' && (
                      <View style={s.tierBadge}>
                        <Text style={s.tierText}>HMU FIRST</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="checkmark-circle" size={24} color={colors.blue} />
              </Animated.View>
            )}
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View key="s1" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>WHERE TO?</Text>
            <Text style={s.stepDesc}>Set your exact pickup and destination.</Text>

            <View style={[s.card, shadow.card]}>
              <AddressInput
                label="PICKUP"
                placeholder="Where are you?"
                value={pickup}
                onChange={setPickup}
                showLocateMe
              />
            </View>
            <View style={[s.card, shadow.card]}>
              <AddressInput
                label="DROPOFF"
                placeholder="Where are you going?"
                value={dropoff}
                onChange={setDropoff}
              />
            </View>
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View key="s2" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>WHEN + HOW MUCH?</Text>

            <View style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>WHEN</Text>
              <View style={s.presetRow}>
                {TIME_PRESETS.map(p => (
                  <TouchableOpacity
                    key={p.value}
                    style={[s.preset, timePreset === p.value && s.presetActive]}
                    onPress={() => { setTimePreset(p.value); void Haptics.selectionAsync(); }}
                  >
                    <Text style={[s.presetText, timePreset === p.value && s.presetTextActive]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[s.card, shadow.card]}>
              <Text style={s.cardLabel}>YOUR OFFER</Text>
              <PriceStepper value={price} onChange={setPrice} min={1} max={500} step={5} />
              <Text style={s.priceNote}>
                Driver earns after platform fee · HMU holds payment until pickup
              </Text>
            </View>

            {driver?.accepts_cash && (
              <TouchableOpacity
                style={[s.cashToggle, isCash && s.cashToggleActive]}
                onPress={() => { setIsCash(v => !v); void Haptics.selectionAsync(); }}
              >
                <Ionicons
                  name={isCash ? 'cash' : 'cash-outline'}
                  size={16}
                  color={isCash ? colors.cash : colors.textFaint}
                />
                <Text style={[s.cashToggleText, isCash && { color: colors.cash }]}>
                  {isCash ? 'PAYING CASH' : 'PAY WITH CARD'}
                </Text>
              </TouchableOpacity>
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
          style={[s.nextBtn, { backgroundColor: colors.blue }, (!validateStep() || submitting) && s.nextBtnDisabled]}
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

function StepDots({ total, current, color }: { total: number; current: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            width: i === current ? 16 : 6,
            height: 4,
            borderRadius: 2,
            backgroundColor: i === current ? color : colors.border,
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
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 1.5 },

  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg },
  stepWrap: { gap: spacing.lg },
  stepTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.textPrimary, letterSpacing: 0.5 },
  stepDesc: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, lineHeight: 22, marginTop: -spacing.sm },

  handleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden',
  },
  atSign: { fontFamily: fonts.display, fontSize: 22, color: colors.blue, paddingHorizontal: spacing.md },
  handleInput: {
    flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.textPrimary,
    paddingVertical: 14,
  },
  findBtn: {
    backgroundColor: colors.blue, paddingHorizontal: spacing.lg,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  findBtnText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.bg, letterSpacing: 1.5 },

  // Search results dropdown
  resultsList: {
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.borderStrong, overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  resultAvatar: { width: 44, height: 44, borderRadius: 22 },
  resultAvatarFallback: {
    backgroundColor: colors.blueDim, borderWidth: 1,
    borderColor: colors.blueBorder, alignItems: 'center', justifyContent: 'center',
  },
  resultAvatarLetter: { fontFamily: fonts.display, fontSize: 20, color: colors.blue },
  resultInfo: { flex: 1, gap: 2 },
  resultName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resultHandle: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  resultArea: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, flex: 1 },
  resultRight: { alignItems: 'flex-end', gap: 4 },
  resultPrice: { fontFamily: fonts.display, fontSize: 18, color: colors.blue },
  resultTierBadge: {
    backgroundColor: colors.cashDim, borderRadius: radius.pill,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.cashBorder,
  },
  resultTierText: { fontFamily: fonts.mono, fontSize: 8, color: colors.cash, letterSpacing: 0.5 },

  driverCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: colors.blueBorder,
  },
  driverAvatar: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  driverAvatarLetter: { fontFamily: fonts.display, fontSize: 26 },
  driverInfo: { flex: 1, gap: 2 },
  driverHandle: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.textPrimary },
  driverName: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },
  driverStats: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  driverStat: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  tierBadge: {
    backgroundColor: colors.cashDim, borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: colors.cashBorder,
  },
  tierText: { fontFamily: fonts.mono, fontSize: 9, color: colors.cash, letterSpacing: 0.5 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.xl, gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 3 },

  presetRow: { flexDirection: 'row', gap: spacing.sm },
  preset: {
    flex: 1, paddingVertical: 10, borderRadius: radius.pill,
    alignItems: 'center', backgroundColor: colors.cardAlt,
    borderWidth: 1, borderColor: colors.border,
  },
  presetActive: { backgroundColor: colors.blueDim, borderColor: colors.blueBorder },
  presetText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
  presetTextActive: { color: colors.blue },

  priceNote: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 16 },

  cashToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  cashToggleActive: { borderColor: colors.cashBorder, backgroundColor: colors.cashDim },
  cashToggleText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, letterSpacing: 1 },

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
    borderRadius: radius.pill, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
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
