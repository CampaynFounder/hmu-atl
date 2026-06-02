// Pricing & Rates — minimum ride, base rate, hourly, out-of-town, deposit floor, store runs.
// Rates → PATCH /api/users/profile { pricing: { minimum, base_rate, hourly, out_of_town, store_run_rate, store_run_percent, store_runs_enabled } }
// Deposit floor → PATCH /api/drivers/booking-settings { deposit_floor }
// Every field saves on a 600ms debounce AND on blur — onBlur alone is unreliable
// in React Native (it doesn't fire when the driver edits a rate then taps Back),
// which silently dropped saves.

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface PricingData {
  pricing: {
    minimum?: number;
    base_rate?: number;
    hourly?: number;
    out_of_town?: number;
    store_run_rate?: number;
    store_run_percent?: number;
    store_runs_enabled?: boolean;
  };
  depositFloor: number | null;
}

export default function PricingScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [minimum, setMinimum] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [hourly, setHourly] = useState('');
  const [outOfTown, setOutOfTown] = useState('');
  const [depositFloor, setDepositFloor] = useState('');
  const [storeRunRate, setStoreRunRate] = useState('');
  const [storeRunPercent, setStoreRunPercent] = useState('');
  const [storeRunsEnabled, setStoreRunsEnabled] = useState(false);
  const togglingRef = useRef(false);
  const storeRunDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRunPercentDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-field debounce timers for the ride rates + deposit floor.
  const rateDebounce = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const depositDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const t = await getToken();
        const d = await apiClient<PricingData>('/driver/profile', t);
        setMinimum(d.pricing?.minimum ? String(d.pricing.minimum) : '');
        setBaseRate(d.pricing?.base_rate ? String(d.pricing.base_rate) : '');
        setHourly(d.pricing?.hourly ? String(d.pricing.hourly) : '');
        setOutOfTown(d.pricing?.out_of_town ? String(d.pricing.out_of_town) : '');
        setDepositFloor(d.depositFloor != null ? String(d.depositFloor) : '');
        setStoreRunRate(d.pricing?.store_run_rate ? String(d.pricing.store_run_rate) : '');
        setStoreRunPercent(d.pricing?.store_run_percent ? String(d.pricing.store_run_percent) : '');
        setStoreRunsEnabled(d.pricing?.store_runs_enabled ?? false);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [getToken]);

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function savePricing(key: string, rawVal: string) {
    const num = parseFloat(rawVal);
    if (isNaN(num) || num < 0) return;
    setSaving(true);
    try {
      const t = await getToken();
      await apiClient('/users/profile', t, {
        method: 'PATCH',
        body: JSON.stringify({ profile_type: 'driver', pricing: { [key]: num } }),
      });
      flash();
    } catch {}
    finally { setSaving(false); }
  }

  // Debounced save-as-you-type for the ride rates. onBlur is unreliable in RN
  // (doesn't fire when the driver edits then taps Back), so the rate fields used
  // to silently drop their last edit — this mirrors the store-run fix below.
  const debouncedSave = useCallback((key: string, raw: string) => {
    if (rateDebounce.current[key]) clearTimeout(rateDebounce.current[key]);
    rateDebounce.current[key] = setTimeout(() => void savePricing(key, raw), 600);
  }, []);

  // Debounced save for store run rate — onBlur is unreliable in React Native
  const saveStoreRunRate = useCallback((raw: string) => {
    if (storeRunDebounce.current) clearTimeout(storeRunDebounce.current);
    storeRunDebounce.current = setTimeout(() => void savePricing('store_run_rate', raw), 600);
  }, []);

  // Debounced save for the store-run percentage (same reliability reason).
  const saveStoreRunPercent = useCallback((raw: string) => {
    if (storeRunPercentDebounce.current) clearTimeout(storeRunPercentDebounce.current);
    storeRunPercentDebounce.current = setTimeout(() => void savePricing('store_run_percent', raw), 600);
  }, []);

  async function toggleStoreRuns(val: boolean) {
    if (togglingRef.current) return;
    togglingRef.current = true;
    setStoreRunsEnabled(val);
    try {
      const t = await getToken();
      // The flat-fee / % fields persist via their own debounced saves, so the
      // toggle only flips the enabled flag.
      await apiClient('/users/profile', t, {
        method: 'PATCH',
        body: JSON.stringify({ profile_type: 'driver', pricing: { store_runs_enabled: val } }),
      });
      flash();
    } catch { setStoreRunsEnabled(!val); }
    finally { togglingRef.current = false; }
  }

  async function saveDepositFloor(rawVal: string) {
    const num = rawVal === '' ? null : parseFloat(rawVal);
    if (num !== null && (isNaN(num) || num < 0)) return;
    setSaving(true);
    try {
      const t = await getToken();
      await apiClient('/drivers/booking-settings', t, {
        method: 'PATCH',
        body: JSON.stringify({ deposit_floor: num }),
      });
      flash();
    } catch {}
    finally { setSaving(false); }
  }

  const debouncedSaveDeposit = useCallback((raw: string) => {
    if (depositDebounce.current) clearTimeout(depositDebounce.current);
    depositDebounce.current = setTimeout(() => void saveDepositFloor(raw), 600);
  }, []);

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        <View style={s.navbar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.navTitle}>PRICING & RATES</Text>
          <View style={s.savingSlot}>
            {saving && <ActivityIndicator size="small" color={colors.green} />}
            {!saving && saved && <Text style={s.savedText}>SAVED</Text>}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.hint}>Set to 0 to leave a rate unset. Riders see these on your profile.</Text>

          {/* Rates */}
          <SectionHeader label="RIDE RATES" />
          <View style={[s.card, shadow.card]}>
            <PriceRow
              label="MINIMUM RIDE"
              sub="Don't take rides below this price"
              value={minimum}
              onChangeText={v => debouncedSave('minimum', v)}
              onBlur={v => savePricing('minimum', v)}
            />
            <Divider />
            <PriceRow
              label="30-MIN BASE RATE"
              sub="Short trips around your area"
              value={baseRate}
              onChangeText={v => debouncedSave('base_rate', v)}
              onBlur={v => savePricing('base_rate', v)}
            />
            <Divider />
            <PriceRow
              label="HOURLY RATE"
              sub="Multi-stop or longer distance"
              value={hourly}
              onChangeText={v => debouncedSave('hourly', v)}
              onBlur={v => savePricing('hourly', v)}
            />
            <Divider />
            <PriceRow
              label="OUT-OF-TOWN / HR"
              sub="Rides outside your usual area"
              value={outOfTown}
              onChangeText={v => debouncedSave('out_of_town', v)}
              onBlur={v => savePricing('out_of_town', v)}
            />
          </View>

          {/* Deposit Floor */}
          <SectionHeader label="DEPOSIT FLOOR" hint="The minimum deposit a rider must put down to book you. Leave blank for the platform default." />
          <View style={[s.card, shadow.card]}>
            <PriceRow
              label="MIN DEPOSIT"
              sub="Platform default: $5"
              value={depositFloor}
              onChangeText={v => debouncedSaveDeposit(v)}
              onBlur={v => saveDepositFloor(v)}
              placeholder="Platform default"
            />
          </View>

          {/* Store Runs */}
          <SectionHeader label="STORE RUNS" hint="Set what you charge for grocery & store-order deliveries. You earn whichever is greater — your flat fee or your % of the order total." />
          <View style={[s.card, shadow.card]}>
            <View style={s.toggleRow}>
              <View style={s.priceLabelCol}>
                <Text style={s.priceLabel}>ACCEPT STORE RUNS</Text>
                <Text style={s.priceSub}>Show up in store run requests</Text>
              </View>
              <Switch
                value={storeRunsEnabled}
                onValueChange={toggleStoreRuns}
                trackColor={{ false: colors.border, true: colors.pinkBorder }}
                thumbColor={storeRunsEnabled ? colors.pink : colors.textFaint}
              />
            </View>
            {storeRunsEnabled && (
              <>
                <Divider />
                <PriceRow
                  label="FLAT FEE / DELIVERY"
                  sub="Minimum you'll take per store run"
                  value={storeRunRate}
                  onChangeText={v => saveStoreRunRate(v)}
                  onBlur={v => savePricing('store_run_rate', v)}
                />
                <Divider />
                <PriceRow
                  label="% OF ORDER"
                  sub="Whichever earns more wins"
                  value={storeRunPercent}
                  onChangeText={v => saveStoreRunPercent(v)}
                  onBlur={v => savePricing('store_run_percent', v)}
                  placeholder="0"
                  unit="%"
                />
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionLabel}>{label}</Text>
      {hint && <Text style={s.sectionHint}>{hint}</Text>}
    </View>
  );
}

// Uncontrolled-internally: the input drives its OWN text state so each keystroke
// re-renders only this row (instant), not the whole screen. The parent is told
// via onChangeText (debounced save only — it must NOT setState per keystroke) and
// onBlur (receives the current text). `value` is the source on load; we re-sync
// only when it changes from outside (initial fetch), never per keystroke.
const PriceRow = memo(function PriceRow({
  label, sub, value, onChangeText, onBlur, placeholder = '$0', unit = '$',
}: {
  label: string; sub: string; value: string;
  onChangeText: (v: string) => void; onBlur: (v: string) => void; placeholder?: string;
  unit?: '$' | '%';
}) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <View style={s.priceRow}>
      <View style={s.priceLabelCol}>
        <Text style={s.priceLabel}>{label}</Text>
        <Text style={s.priceSub}>{sub}</Text>
      </View>
      <View style={s.priceInputWrap}>
        {unit === '$' && <Text style={s.dollarSign}>$</Text>}
        <TextInput
          style={s.priceInput}
          value={text}
          onChangeText={(v) => { setText(v); onChangeText(v); }}
          onBlur={() => onBlur(text)}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
        {unit === '%' && <Text style={s.dollarSign}>%</Text>}
      </View>
    </View>
  );
});

function Divider() {
  return <View style={s.divider} />;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  navTitle: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary, letterSpacing: 2 },
  savingSlot: { width: 60, alignItems: 'flex-end' },
  savedText: { fontFamily: fonts.mono, fontSize: 10, color: colors.green, letterSpacing: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginBottom: spacing.sm, lineHeight: 20 },
  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.sm, paddingHorizontal: 2 },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3 },
  sectionHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 4, lineHeight: 18 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  priceLabelCol: { flex: 1, marginRight: spacing.md },
  priceLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2 },
  priceSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  priceInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dollarSign: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.textSecondary },
  priceInput: {
    fontFamily: fonts.bodyMedium, fontSize: 18, color: colors.textPrimary,
    minWidth: 64, textAlign: 'right',
    borderBottomWidth: 1, borderBottomColor: colors.borderStrong,
    paddingBottom: 2,
  },
});
