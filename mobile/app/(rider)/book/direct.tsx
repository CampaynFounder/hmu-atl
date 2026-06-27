// Direct Booking — rider targets a specific driver by handle.
// 3-step wizard: (1) find driver → (2) pickup + dropoff → (3) when + price
// POST /api/drivers/{handle}/book → waiting screen with 15-min countdown.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
  TextInput, ActivityIndicator, Alert,
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
import { savePendingRideLocations } from '@/lib/pending-ride-locations';
import { useBookingDraft } from '@/hooks/use-booking-draft';
import { ResumeDraftSheet } from '@/components/resume-draft-sheet';
import { HmuImage } from '@/components/HmuImage';

interface DriverPreview {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  tier: string;
  completedRides: number;
  chillScore: number | null;
  acceptsCash: boolean;
  services: Array<{ name: string; icon: string; price: number; pricingType: string }>;
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

  // INVARIANT: arriving from Browse with a pre-selected driver (prefillHandle)
  // means step 0 ("SELECT YOUR DRIVER") is NEVER valid — the rider already chose
  // their driver by tapping HMU. Step 0 is only for manual handle search.
  // `minStep` is the floor and `goToStep` clamps to it, so NO code path (draft
  // resume, back nav, future edits) can ever bounce a prefilled rider to step 0.
  // Do not call setStep directly — always go through goToStep.
  const minStep = prefillHandle ? 1 : 0;
  const [step, setStepRaw] = useState(minStep);
  const goToStep = useCallback((n: number) => setStepRaw(Math.max(minStep, n)), [minStep]);
  const setStep = goToStep;

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
          '/rider/browse/list?offset=0&limit=200', t,
        );
        setBrowseIndex(data.drivers ?? []);
      } catch {}
    }
    void loadIndex();
  }, [getToken]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    const q = handleInput.trim().toLowerCase().replace(/^@/, '');
    if (q.length < 1 || driver) { setSearchResults([]); return; }
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

  // Step 2 — locations. `stops` holds optional waypoints between pickup and
  // dropoff; a null slot is an empty input awaiting an address (cleared slots
  // are spliced out). Filtered to real stops on submit.
  const [pickup, setPickup] = useState<ValidatedAddress | null>(null);
  const [dropoff, setDropoff] = useState<ValidatedAddress | null>(null);
  const [stops, setStops] = useState<(ValidatedAddress | null)[]>([]);
  const MAX_STOPS = 4;

  // Step 3 — when + price
  const [timePreset, setTimePreset] = useState<string>('now');
  const [price, setPrice] = useState(25);
  const [isCash, setIsCash] = useState(false);

  // Step 1 — menu items (only shown when driver has services)
  const [selectedServices, setSelectedServices] = useState<Map<string, number>>(new Map());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back-out draft — resume or start over within the 5-min TTL. selectedServices
  // is a Map, so it's serialized to entries for storage and rebuilt on resume.
  type DirectDraft = {
    step: number;
    handleInput: string;
    driver: DriverPreview | null;
    pickup: ValidatedAddress | null;
    dropoff: ValidatedAddress | null;
    stops: (ValidatedAddress | null)[];
    timePreset: string;
    price: number;
    isCash: boolean;
    services: [string, number][];
  };
  const { pending: pendingDraft, save: saveDraft, clear: clearDraft, dismiss: dismissDraft } =
    useBookingDraft<DirectDraft>('direct');

  useEffect(() => {
    const started = !!driver || !!pickup || !!dropoff;
    if (started) {
      saveDraft({
        step, handleInput, driver, pickup, dropoff, stops, timePreset, price, isCash,
        services: Array.from(selectedServices.entries()),
      });
    }
  }, [step, handleInput, driver, pickup, dropoff, stops, timePreset, price, isCash, selectedServices, saveDraft]);

  function applyDraft(d: DirectDraft) {
    setStep(d.step);
    setHandleInput(d.handleInput);
    setDriver(d.driver);
    setPickup(d.pickup);
    setDropoff(d.dropoff);
    setStops(Array.isArray(d.stops) ? d.stops : []);
    setTimePreset(d.timePreset);
    setPrice(d.price);
    setIsCash(d.isCash);
    setSelectedServices(new Map(d.services ?? []));
    dismissDraft();
  }

  // Show RESET once the rider has progressed past the starting step or entered a
  // location. A prefilled driver alone doesn't count — that's not something they
  // typed, and clearing it would fight the prefill invariant.
  const canReset = step > minStep || !!pickup || !!dropoff;

  // One-tap reset — wipe the trip back to defaults, drop the saved draft, and
  // jump to the first valid step. INVARIANT: route through setStep (goToStep) and
  // floor at minStep so a prefilled rider is never bounced to driver search; their
  // chosen driver is preserved. A manual-search rider gets a full wipe incl. driver.
  function startOver() {
    setStep(minStep);
    if (!prefillHandle) {
      setHandleInput('');
      setDriver(null);
      setDriverError(null);
      setSearchResults([]);
    }
    setPickup(null);
    setDropoff(null);
    setStops([]);
    setTimePreset('now');
    setPrice(25);
    setIsCash(false);
    setSelectedServices(new Map());
    setError(null);
    clearDraft();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function confirmStartOver() {
    Alert.alert(
      'Start over?',
      prefillHandle
        ? 'This clears the locations, price, and extras and resets to the first step. Your selected driver stays.'
        : 'This clears the driver, locations, price, and every other detail and resets to the first step.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Start over', style: 'destructive', onPress: startOver },
      ],
    );
  }

  const findDriver = useCallback(async (overrideHandle?: string, autoAdvance = false) => {
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
      if (autoAdvance) setStep(1);
    } catch {
      setDriverError("Couldn't find that driver. Double-check the handle and try again.");
    } finally {
      setFindingDriver(false);
    }
  }, [handleInput, getToken]);

  // Load driver in background when arriving from Browse — step already starts at 1
  useEffect(() => {
    if (prefillHandle) void findDriver(prefillHandle);
  }, []);

  // Step layout: 0=driver, 1=locations, 2=extras (skipped if driver has no services), 3=when+price
  const hasMenu = (driver?.services?.length ?? 0) > 0;

  function validateStep(): boolean {
    if (step === 0) return !!driver;
    if (step === 1) return !!pickup && !!dropoff;
    if (step === 2) return true; // extras always optional
    return price >= 1;
  }

  async function advance() {
    if (!validateStep()) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (step === 0) {
      setStep(1);
      await Haptics.selectionAsync();
    } else if (step === 1) {
      setStep(hasMenu ? 2 : 3);
      await Haptics.selectionAsync();
    } else if (step < 3) {
      setStep(step + 1);
      await Haptics.selectionAsync();
    } else {
      await submit();
    }
  }

  function back() {
    if (step === 0) router.back();
    // When we arrived via prefillHandle (skipped step 0), step 1 back goes to previous screen
    else if (step === 1 && prefillHandle) router.back();
    else if (step === 1) setStep(0);
    else if (step === 2) setStep(1);
    else setStep(hasMenu ? 2 : 1);
  }

  async function submit() {
    if (!driver) {
      setError("Couldn't load the driver info. Go back and try again.");
      return;
    }
    if (!pickup || !dropoff) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await getToken();
      const { resolvedTime, timeDisplay, isNow } = resolveScheduledTime(timePreset, '');
      const addOns = Array.from(selectedServices.entries())
        .filter(([, qty]) => qty > 0)
        .map(([name, qty]) => {
          const svc = driver!.services.find(s => s.name === name);
          return { name, quantity: qty, priceCents: Math.round((svc?.price ?? 0) * 100) };
        });

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
            ...(addOns.length > 0 ? { addOns } : {}),
          }),
        },
      );
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearDraft();
      // Carry the validated trip forward so Pull Up needs no re-entry. Survives
      // the accept gap (and app restarts) via AsyncStorage; cleared on COO.
      await savePendingRideLocations({
        pickup,
        dropoff,
        stops: stops.filter((x): x is ValidatedAddress => !!x),
        driverHandle: driver.handle,
      });
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

  const btnLabel = step < 3
    ? 'NEXT →'
    : submitting ? '' : `CONFIRM BOOKING — $${price}`;

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {pendingDraft && (
        <ResumeDraftSheet
          label="booking"
          onResume={() => applyDraft(pendingDraft)}
          onStartOver={startOver}
        />
      )}
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={back} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>DIRECT BOOKING</Text>
          <StepDots
            total={hasMenu ? 4 : 3}
            current={hasMenu ? step : step > 2 ? step - 1 : step}
            color={colors.blue}
          />
        </View>
        {canReset ? (
          <TouchableOpacity onPress={confirmStartOver} style={s.resetBtn} hitSlop={12}>
            <Ionicons name="refresh" size={15} color={colors.textFaint} />
            <Text style={s.resetText}>RESET</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <Animated.View key="s0" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>SELECT YOUR DRIVER</Text>
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
                    {/* Avatar / photo — cached via expo-image */}
                    <HmuImage
                      uri={r.photoUrl}
                      style={s.resultAvatar}
                      resizeMode="cover"
                      fallbackInitials={(r.displayName || r.handle)[0] ?? '?'}
                      fallbackBg={colors.blueDim}
                    />

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

            {/* Browse link — hidden once a driver is confirmed */}
            {!driver && (
              <Animated.View entering={FadeIn.delay(300).duration(400)} style={s.browseRow}>
                <View style={s.browseDivider} />
                <Text style={s.browseOr}>or</Text>
                <View style={s.browseDivider} />
              </Animated.View>
            )}
            {!driver && (
              <TouchableOpacity
                style={s.browseLink}
                onPress={() => router.push('/(rider)/browse' as never)}
                activeOpacity={0.7}
              >
                <Ionicons name="people-outline" size={16} color={colors.blue} />
                <Text style={s.browseLinkText}>BROWSE ALL DRIVERS</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.blue} />
              </TouchableOpacity>
            )}

            {driver && (
              <Animated.View entering={FadeIn.duration(350)} style={[s.driverCard, shadow.card]}>
                <HmuImage
                  uri={driver.avatarUrl}
                  style={[s.driverAvatar, { borderWidth: 0 }]}
                  resizeMode="cover"
                  fallbackInitials={(driver.displayName ?? driver.handle)[0] ?? '?'}
                  fallbackBg={colors.blueDim}
                />
                <View style={s.driverInfo}>
                  <Text style={s.driverHandle}>@{driver.handle}</Text>
                  {driver.displayName && (
                    <Text style={s.driverName}>{driver.displayName}</Text>
                  )}
                  <View style={s.driverStats}>
                    <Text style={s.driverStat}>{driver.completedRides} rides</Text>
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

            {/* Optional stops between pickup and dropoff */}
            {stops.map((st, i) => (
              <View key={`stop-${i}`} style={[s.card, shadow.card]}>
                <AddressInput
                  label={`STOP ${i + 1}`}
                  placeholder="Add a stop along the way"
                  value={st}
                  onChange={(v) => setStops(prev => {
                    const next = [...prev];
                    if (v) next[i] = v; else next.splice(i, 1); // clearing removes the slot
                    return next;
                  })}
                />
              </View>
            ))}
            {stops.length < MAX_STOPS && (
              <TouchableOpacity
                style={s.addStopBtn}
                onPress={() => { setStops(prev => [...prev, null]); void Haptics.selectionAsync(); }}
                activeOpacity={0.75}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.blue} />
                <Text style={s.addStopText}>ADD A STOP</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {step === 2 && driver && (
          <Animated.View key="s2" entering={FadeInUp.duration(300)} style={s.stepWrap}>
            <Text style={s.stepTitle}>ADD EXTRAS?</Text>
            <Text style={s.stepDesc}>
              {driver.displayName ?? `@${driver.handle}`} offers these add-ons. Add any you want included with your booking.
            </Text>
            {driver.services.map(svc => {
              const qty = selectedServices.get(svc.name) ?? 0;
              return (
                <View key={svc.name} style={[s.card, shadow.card, s.menuRow]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.menuItemName}>{svc.icon} {svc.name}</Text>
                    <Text style={s.menuItemPrice}>
                      ${svc.price.toFixed(2)}{svc.pricingType === 'per_unit' ? ' / unit' : svc.pricingType === 'per_minute' ? ' / min' : ''}
                    </Text>
                  </View>
                  <View style={s.qtyRow}>
                    {qty > 0 && (
                      <TouchableOpacity
                        style={s.qtyBtn}
                        onPress={() => {
                          const next = new Map(selectedServices);
                          if (qty <= 1) next.delete(svc.name);
                          else next.set(svc.name, qty - 1);
                          setSelectedServices(next);
                          void Haptics.selectionAsync();
                        }}
                      >
                        <Text style={s.qtyBtnText}>−</Text>
                      </TouchableOpacity>
                    )}
                    {qty > 0 && <Text style={s.qtyCount}>{qty}</Text>}
                    <TouchableOpacity
                      style={[s.qtyBtn, s.qtyBtnAdd]}
                      onPress={() => {
                        const next = new Map(selectedServices);
                        next.set(svc.name, qty + 1);
                        setSelectedServices(next);
                        void Haptics.selectionAsync();
                      }}
                    >
                      <Ionicons name="add" size={18} color={colors.bg} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            {selectedServices.size > 0 && (
              <View style={s.addOnTotal}>
                <Text style={s.addOnTotalLabel}>ADD-ON TOTAL</Text>
                <Text style={s.addOnTotalValue}>
                  ${Array.from(selectedServices.entries()).reduce((sum, [name, qty]) => {
                    const svc = driver.services.find(sv => sv.name === name);
                    return sum + (svc ? svc.price * qty : 0);
                  }, 0).toFixed(2)}
                </Text>
              </View>
            )}
            <Text style={s.menuSkipHint}>This step is optional — skip to continue without extras.</Text>
          </Animated.View>
        )}

        {step === 3 && (
          <Animated.View key="s3" entering={FadeInUp.duration(300)} style={s.stepWrap}>
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

            {driver?.acceptsCash && (
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
  resetBtn: {
    minWidth: 40, height: 40, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', gap: 4, paddingLeft: spacing.sm,
  },
  resetText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1 },

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

  // Browse all drivers link
  browseRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  browseDivider: { flex: 1, height: 1, backgroundColor: colors.border },
  browseOr: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  browseLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md,
    backgroundColor: colors.blueDim, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.blueBorder,
  },
  browseLinkText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.blue, letterSpacing: 1.5 },

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

  addStopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.blueDim, borderWidth: 1, borderColor: colors.blueBorder,
    borderStyle: 'dashed',
  },
  addStopText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.blue, letterSpacing: 1.2 },

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

  // Menu items step
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  menuItemName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  menuItemPrice: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  qtyBtnAdd: { backgroundColor: colors.blue, borderColor: colors.blue },
  qtyBtnText: { fontFamily: fonts.display, fontSize: 18, color: colors.textPrimary, lineHeight: 22 },
  qtyCount: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.textPrimary, minWidth: 20, textAlign: 'center' },
  addOnTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.blueDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.blueBorder, padding: spacing.lg,
  },
  addOnTotalLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.blue, letterSpacing: 1.5 },
  addOnTotalValue: { fontFamily: fonts.display, fontSize: 24, color: colors.blue },
  menuSkipHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center' },

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
