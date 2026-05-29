// Request Pickup — customer delivery request wizard.
// 3 steps: Merchant → Items → Breakdown + Confirm.
// Route: /(rider)/book/delivery

import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient, API_BASE } from '@/lib/api';
import type { DeliveryItem, DeliveryEstimate } from '@/shared/delivery-types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MerchantForm {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

type Step = 'merchant' | 'items' | 'breakdown';

// ── Helpers ───────────────────────────────────────────────────────────────────

function newItem(): DeliveryItem {
  return {
    id: Math.random().toString(36).slice(2),
    name: '',
    quantity: 1,
    estimatedPrice: 0,
  };
}

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BookDelivery() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const [step, setStep] = useState<Step>('merchant');
  const [merchant, setMerchant] = useState<MerchantForm>({ name: '', address: '', lat: null, lng: null });
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);
  const [items, setItems] = useState<DeliveryItem[]>([newItem()]);
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Step 1 helpers ──────────────────────────────────────────────────────────

  const canAdvanceToItems =
    merchant.name.trim().length > 0 &&
    merchant.address.trim().length > 0 &&
    customerAddress.trim().length > 0;

  async function goToItems() {
    // Use placeholder coords if Mapbox geocoding isn't wired yet.
    // In production, integrate AddressInput with geocoded lat/lng.
    if (!merchant.lat) {
      setMerchant((m) => ({ ...m, lat: 33.749, lng: -84.388 }));
    }
    if (!customerLat) {
      setCustomerLat(33.749);
      setCustomerLng(-84.388);
    }
    setStep('items');
  }

  // ── Step 2 helpers ──────────────────────────────────────────────────────────

  function addItem() {
    setItems((prev) => [...prev, newItem()]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: string, patch: Partial<DeliveryItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  const validItems = items.filter((i) => i.name.trim().length > 0);
  const totalEstimatedSpend = validItems.reduce((s, i) => s + i.estimatedPrice * i.quantity, 0);

  async function fetchEstimate() {
    setLoading(true);
    try {
      const mLat = merchant.lat ?? 33.749;
      const mLng = merchant.lng ?? -84.388;
      const cLat = customerLat ?? 33.749;
      const cLng = customerLng ?? -84.388;
      const spendCents = Math.round(totalEstimatedSpend * 100);

      const est = await apiClient<DeliveryEstimate>(
        `/delivery/estimate?merchantLat=${mLat}&merchantLng=${mLng}&customerLat=${cLat}&customerLng=${cLng}&estimatedMerchantSpendCents=${spendCents}`,
        null,
      );
      setEstimate(est);
      setStep('breakdown');
    } catch (e: any) {
      Alert.alert('Could not calculate estimate', e.message ?? 'Try again');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: submit ──────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      const t = await getToken();
      const res = await apiClient<{ deliveryId: string; deliveryPin: string }>(
        '/delivery/request',
        t,
        {
          method: 'POST',
          body: JSON.stringify({
            merchantName: merchant.name,
            merchantAddress: merchant.address,
            merchantLat: merchant.lat ?? 33.749,
            merchantLng: merchant.lng ?? -84.388,
            customerAddress,
            customerLat: customerLat ?? 33.749,
            customerLng: customerLng ?? -84.388,
            items: validItems.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              estimatedPriceCents: Math.round(i.estimatedPrice * 100),
              notes: i.notes,
            })),
          }),
        },
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/(rider)/delivery/[id]' as any, params: { id: res.deliveryId } });
    } catch (e: any) {
      Alert.alert('Could not place request', e.message ?? 'Try again');
    } finally {
      setSubmitting(false);
    }
  }, [getToken, merchant, customerAddress, customerLat, customerLng, validItems, router]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>REQUEST PICKUP</Text>
        <StepIndicator current={step} />
      </View>

      {step === 'merchant' && (
        <Animated.View entering={FadeInRight.duration(300)} style={{ flex: 1 }}>
          <MerchantStep
            merchant={merchant}
            setMerchant={setMerchant}
            customerAddress={customerAddress}
            setCustomerAddress={setCustomerAddress}
            canAdvance={canAdvanceToItems}
            onNext={goToItems}
          />
        </Animated.View>
      )}

      {step === 'items' && (
        <Animated.View entering={FadeInRight.duration(300)} style={{ flex: 1 }}>
          <ItemsStep
            items={items}
            onAdd={addItem}
            onRemove={removeItem}
            onUpdate={updateItem}
            totalEstimated={totalEstimatedSpend}
            loading={loading}
            onBack={() => setStep('merchant')}
            onNext={fetchEstimate}
          />
        </Animated.View>
      )}

      {step === 'breakdown' && estimate && (
        <Animated.View entering={FadeInRight.duration(300)} style={{ flex: 1 }}>
          <BreakdownStep
            estimate={estimate}
            items={validItems}
            onBack={() => setStep('items')}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ['merchant', 'items', 'breakdown'];
  const idx = steps.indexOf(current);
  return (
    <View style={si.row}>
      {steps.map((_, i) => (
        <View key={i} style={[si.dot, i <= idx && si.dotActive]} />
      ))}
    </View>
  );
}

const si = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  dotActive: { backgroundColor: colors.pink, borderColor: colors.pinkBorder },
});

// ── Step 1: Merchant ──────────────────────────────────────────────────────────

function MerchantStep({
  merchant, setMerchant, customerAddress, setCustomerAddress, canAdvance, onNext,
}: {
  merchant: MerchantForm;
  setMerchant: (fn: (m: MerchantForm) => MerchantForm) => void;
  customerAddress: string;
  setCustomerAddress: (v: string) => void;
  canAdvance: boolean;
  onNext: () => void;
}) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={s.stepTitle}>WHERE IS THE MERCHANT?</Text>
      <Text style={s.stepSub}>We'll send a courier to purchase your items from this location.</Text>

      <Field label="STORE NAME" placeholder="e.g. Kroger, Target, Walgreens">
        <TextInput
          style={s.input}
          value={merchant.name}
          onChangeText={(v) => setMerchant((m) => ({ ...m, name: v }))}
          placeholder="Store name"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
        />
      </Field>

      <Field label="MERCHANT ADDRESS" placeholder="Full store address">
        <TextInput
          style={[s.input, s.inputTall]}
          value={merchant.address}
          onChangeText={(v) => setMerchant((m) => ({ ...m, address: v }))}
          placeholder="123 Peachtree St NW, Atlanta, GA"
          placeholderTextColor={colors.textFaint}
          multiline
          textAlignVertical="top"
        />
      </Field>

      <Field label="DELIVER TO" placeholder="Your address">
        <TextInput
          style={[s.input, s.inputTall]}
          value={customerAddress}
          onChangeText={setCustomerAddress}
          placeholder="456 Auburn Ave NE, Atlanta, GA"
          placeholderTextColor={colors.textFaint}
          multiline
          textAlignVertical="top"
        />
      </Field>

      <TouchableOpacity
        style={[s.primaryBtn, !canAdvance && s.disabled]}
        onPress={onNext}
        disabled={!canAdvance}
        activeOpacity={0.85}
      >
        <Text style={s.primaryBtnText}>ADD ITEMS</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.bg} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Step 2: Items ─────────────────────────────────────────────────────────────

function ItemsStep({
  items, onAdd, onRemove, onUpdate, totalEstimated, loading, onBack, onNext,
}: {
  items: DeliveryItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<DeliveryItem>) => void;
  totalEstimated: number;
  loading: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const hasValidItem = items.some((i) => i.name.trim().length > 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={s.stepTitle}>WHAT DO YOU NEED?</Text>
      <Text style={s.stepSub}>List the items you want. Be specific so the courier gets the right thing.</Text>

      {items.map((item, idx) => (
        <ItemRow
          key={item.id}
          item={item}
          index={idx}
          onUpdate={(patch) => onUpdate(item.id, patch)}
          onRemove={items.length > 1 ? () => onRemove(item.id) : undefined}
        />
      ))}

      <TouchableOpacity style={s.addItemBtn} onPress={onAdd} activeOpacity={0.8}>
        <Ionicons name="add-circle-outline" size={18} color={colors.pink} />
        <Text style={s.addItemText}>ADD ANOTHER ITEM</Text>
      </TouchableOpacity>

      {totalEstimated > 0 && (
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>ESTIMATED SPEND</Text>
          <Text style={s.totalValue}>{fmtMoney(totalEstimated)}</Text>
        </View>
      )}

      <View style={s.footerRow}>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={16} color={colors.textTertiary} />
          <Text style={s.backBtnText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.primaryBtn, { flex: 1 }, (!hasValidItem || loading) && s.disabled]}
          onPress={onNext}
          disabled={!hasValidItem || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator size="small" color={colors.bg} />
            : <><Text style={s.primaryBtnText}>REVIEW COST</Text><Ionicons name="arrow-forward" size={16} color={colors.bg} /></>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function ItemRow({
  item, index, onUpdate, onRemove,
}: {
  item: DeliveryItem;
  index: number;
  onUpdate: (patch: Partial<DeliveryItem>) => void;
  onRemove?: () => void;
}) {
  return (
    <View style={[s.itemCard, shadow.card]}>
      <View style={s.itemHeader}>
        <Text style={s.itemNum}>ITEM {index + 1}</Text>
        {onRemove && (
          <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle-outline" size={20} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>
      <TextInput
        style={s.itemInput}
        value={item.name}
        onChangeText={(v) => onUpdate({ name: v })}
        placeholder="Item name (e.g. Almond Milk, 2% Gallon)"
        placeholderTextColor={colors.textFaint}
      />
      <View style={s.itemMeta}>
        <View style={s.itemMetaField}>
          <Text style={s.itemMetaLabel}>QTY</Text>
          <TextInput
            style={s.itemMetaInput}
            value={String(item.quantity)}
            onChangeText={(v) => onUpdate({ quantity: Math.max(1, parseInt(v, 10) || 1) })}
            keyboardType="numeric"
            maxLength={2}
          />
        </View>
        <View style={s.itemMetaField}>
          <Text style={s.itemMetaLabel}>EST. PRICE</Text>
          <TextInput
            style={s.itemMetaInput}
            value={item.estimatedPrice > 0 ? String(item.estimatedPrice) : ''}
            onChangeText={(v) => onUpdate({ estimatedPrice: parseFloat(v) || 0 })}
            placeholder="$0"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
          />
        </View>
      </View>
      <TextInput
        style={s.itemNotes}
        value={item.notes ?? ''}
        onChangeText={(v) => onUpdate({ notes: v })}
        placeholder="Notes (brand, size, any substitutes ok?)"
        placeholderTextColor={colors.textFaint}
      />
    </View>
  );
}

// ── Step 3: Breakdown ─────────────────────────────────────────────────────────

function BreakdownStep({
  estimate, items, onBack, onSubmit, submitting,
}: {
  estimate: DeliveryEstimate;
  items: DeliveryItem[];
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={s.stepContent}>
      <Text style={s.stepTitle}>REVIEW & CONFIRM</Text>
      <Text style={s.stepSub}>We'll place a hold for the total. You'll only be charged the actual amount after delivery.</Text>

      <View style={[s.breakdownCard, shadow.card]}>
        <BreakdownRow label="Merchant items (est.)" value={fmtMoney(estimate.estimatedMerchantSpend)} />
        <BreakdownRow label="Delivery fee" value={fmtMoney(estimate.deliveryFee)} />
        <BreakdownRow label="Platform fee" value={fmtMoney(estimate.platformFee)} />
        <BreakdownRow label="Authorization buffer (15%)" value={fmtMoney(estimate.authBuffer)} faint />
        <View style={s.divider} />
        <BreakdownRow label="TOTAL HOLD" value={fmtMoney(estimate.totalHold)} bold />
      </View>

      <View style={[s.itemsSummaryCard, shadow.card]}>
        <Text style={s.summaryTitle}>ITEMS ({items.length})</Text>
        {items.map((item) => (
          <View key={item.id} style={s.summaryRow}>
            <Text style={s.summaryItemName} numberOfLines={1}>{item.quantity}× {item.name}</Text>
            {item.estimatedPrice > 0 && (
              <Text style={s.summaryItemPrice}>{fmtMoney(item.estimatedPrice * item.quantity)}</Text>
            )}
          </View>
        ))}
      </View>

      <Text style={s.disclaimer}>
        The hold covers the estimated merchant spend plus our delivery fee. After verified delivery, only the actual receipt total is charged.
      </Text>

      <View style={s.footerRow}>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={16} color={colors.textTertiary} />
          <Text style={s.backBtnText}>BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.primaryBtn, { flex: 1 }, submitting && s.disabled]}
          onPress={onSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting
            ? <ActivityIndicator size="small" color={colors.bg} />
            : <><Text style={s.primaryBtnText}>PLACE REQUEST</Text><Ionicons name="checkmark" size={16} color={colors.bg} /></>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function BreakdownRow({ label, value, bold, faint }: { label: string; value: string; bold?: boolean; faint?: boolean }) {
  return (
    <View style={s.bdRow}>
      <Text style={[s.bdLabel, faint && { color: colors.textFaint }]}>{label}</Text>
      <Text style={[s.bdValue, bold && { color: colors.pink, fontFamily: fonts.monoBold }, faint && { color: colors.textFaint }]}>
        {value}
      </Text>
    </View>
  );
}

function Field({ label, placeholder: _ph, children }: { label: string; placeholder?: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.textPrimary, letterSpacing: 1 },

  stepContent: { padding: spacing.xl, paddingBottom: 48, gap: spacing.lg },
  stepTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary, letterSpacing: 0.5 },
  stepSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20, marginTop: -spacing.sm },

  field: { gap: spacing.sm },
  fieldLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },
  input: {
    backgroundColor: colors.card, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
  },
  inputTall: { minHeight: 72 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.pink,
    borderRadius: radius.pill, paddingVertical: 16,
  },
  primaryBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
  disabled: { opacity: 0.4 },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 16, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  backBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary },

  footerRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },

  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  addItemText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.pink, letterSpacing: 1 },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.pinkDim, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.pinkBorder, padding: spacing.lg,
  },
  totalLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5 },
  totalValue: { fontFamily: fonts.display, fontSize: 24, color: colors.pink },

  itemCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.sm,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemNum: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },
  itemInput: {
    backgroundColor: colors.cardAlt, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary,
  },
  itemMeta: { flexDirection: 'row', gap: spacing.sm },
  itemMetaField: { flex: 1, gap: 4 },
  itemMetaLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 1.5 },
  itemMetaInput: {
    backgroundColor: colors.cardAlt, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary,
  },
  itemNotes: {
    backgroundColor: colors.cardAlt, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
    fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary,
  },

  breakdownCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.md,
  },
  bdRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bdLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary },
  bdValue: { fontFamily: fonts.mono, fontSize: 13, color: colors.textPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },

  itemsSummaryCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.sm,
  },
  summaryTitle: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2, marginBottom: spacing.xs },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryItemName: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, flex: 1 },
  summaryItemPrice: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },

  disclaimer: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 18, textAlign: 'center' },
});
