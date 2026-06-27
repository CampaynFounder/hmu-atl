// Driver service menu — add-on management.
// APIs: GET /api/driver/service-menu, POST (add), PATCH (toggle/price), DELETE (remove)

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Alert, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow, toggle } from '@/lib/theme';
import { apiClient } from '@/lib/api';

// ── Quick-add presets ──────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Extra Stop',    icon: '📍', pricing_type: 'per_unit',   unit_label: 'stop', default_price: 3 },
  { label: 'Wait Time',     icon: '⏱',  pricing_type: 'per_minute', unit_label: 'min',  default_price: 2 },
  { label: 'Late Night',    icon: '🌙', pricing_type: 'flat',       unit_label: null,   default_price: 5 },
  { label: '420 Friendly',  icon: '🌿', pricing_type: 'flat',       unit_label: null,   default_price: 5 },
  { label: 'Round Trip',    icon: '🔄', pricing_type: 'flat',       unit_label: null,   default_price: 10 },
  { label: 'Airport Run',   icon: '✈️',  pricing_type: 'flat',       unit_label: null,   default_price: 5 },
  { label: 'Pet Friendly',  icon: '🐾', pricing_type: 'flat',       unit_label: null,   default_price: 5 },
  { label: 'Luggage',       icon: '🧳', pricing_type: 'per_unit',   unit_label: 'bag',  default_price: 3 },
  { label: 'Large Vehicle', icon: '🚙', pricing_type: 'flat',       unit_label: null,   default_price: 10 },
  { label: 'Grocery Run',   icon: '🛒', pricing_type: 'flat',       unit_label: null,   default_price: 8 },
];

const PRICING_TYPES = [
  { value: 'flat',       label: 'Flat fee' },
  { value: 'per_unit',   label: 'Per unit' },
  { value: 'per_minute', label: 'Per minute' },
  { value: 'per_stop',   label: 'Per stop' },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  item_id: string | null;
  name: string;
  icon: string;
  price: number;
  pricing_type: string;
  unit_label: string | null;
  is_active: boolean;
}

interface MenuResponse {
  menu: MenuItem[];
  tier: string;
  limits: { maxItems: number | null };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MenuScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tier, setTier] = useState('free');
  const [maxItems, setMaxItems] = useState<number | null>(5);
  const [acting, setActing] = useState<string | null>(null);

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formPricingType, setFormPricingType] = useState('flat');
  const [formUnitLabel, setFormUnitLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchMenu = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<MenuResponse>('/driver/service-menu', t);
      setMenu(data.menu ?? []);
      setTier(data.tier ?? 'free');
      setMaxItems(data.limits?.maxItems ?? 5);
    } catch {}
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { void fetchMenu(); }, [fetchMenu]);

  // ── Toggle active ─────────────────────────────────────────────────────────

  async function toggleItem(item: MenuItem) {
    const next = !item.is_active;
    setMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, is_active: next } : m));
    try {
      const t = await getToken();
      await apiClient('/driver/service-menu', t, {
        method: 'PATCH',
        body: JSON.stringify({ menu_item_id: item.id, is_active: next }),
      });
      Haptics.selectionAsync();
    } catch {
      setMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, is_active: !next } : m));
    }
  }

  // ── Remove item ───────────────────────────────────────────────────────────

  function confirmRemove(item: MenuItem) {
    Alert.alert(
      `Remove "${item.name}"?`,
      'This item will be removed from your menu.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeItem(item),
        },
      ]
    );
  }

  async function removeItem(item: MenuItem) {
    setActing(item.id);
    const prev = [...menu];
    setMenu((m) => m.filter((x) => x.id !== item.id));
    try {
      const t = await getToken();
      await apiClient('/driver/service-menu', t, {
        method: 'DELETE',
        body: JSON.stringify({ menu_item_id: item.id }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setMenu(prev);
    }
    finally { setActing(null); }
  }

  // ── Preset tap → populate form ────────────────────────────────────────────

  function applyPreset(preset: typeof PRESETS[0]) {
    setFormName(preset.label);
    setFormIcon(preset.icon);
    setFormPrice(String(preset.default_price));
    setFormPricingType(preset.pricing_type);
    setFormUnitLabel(preset.unit_label ?? '');
    setShowForm(true);
  }

  // ── Add item ──────────────────────────────────────────────────────────────

  async function addItem() {
    const name = formName.trim();
    const price = parseFloat(formPrice);
    if (!name || isNaN(price) || price < 0) {
      Alert.alert('Check your input', 'Name and a valid price are required.');
      return;
    }
    if (maxItems !== null && menu.length >= maxItems) {
      Alert.alert('Limit reached', `Free drivers can have up to ${maxItems} menu items. Upgrade to HMU First for unlimited.`);
      return;
    }
    setAdding(true);
    try {
      const t = await getToken();
      const item = await apiClient<MenuItem>('/driver/service-menu', t, {
        method: 'POST',
        body: JSON.stringify({
          custom_name: name,
          custom_icon: formIcon.trim() || undefined,
          price,
          pricing_type: formPricingType,
          unit_label: formUnitLabel.trim() || null,
        }),
      });
      setMenu((prev) => [...prev, item]);
      setFormName('');
      setFormIcon('');
      setFormPrice('');
      setFormPricingType('flat');
      setFormUnitLabel('');
      setShowForm(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Could not add item', e.message ?? 'Try again');
    }
    finally { setAdding(false); }
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.green} />
      </View>
    );
  }

  const atLimit = maxItems !== null && menu.length >= maxItems;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Navbar */}
      <View style={s.navbar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.navTitle}>SERVICE MENU</Text>
          <Text style={s.navSub}>{menu.length} item{menu.length !== 1 ? 's' : ''}{maxItems !== null ? ` / ${maxItems} max` : ''}</Text>
        </View>
        <TouchableOpacity
          style={[s.addBtn, atLimit && s.addBtnDisabled]}
          onPress={() => { if (!atLimit) { setShowForm((v) => !v); } }}
          activeOpacity={0.7}
          disabled={atLimit}
        >
          <Ionicons name={showForm ? 'close' : 'add'} size={20} color={atLimit ? colors.textFaint : colors.green} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── Quick-add presets ── */}
        {!atLimit && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>QUICK ADD</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetScroll}>
              {PRESETS.map((p) => {
                const exists = menu.some((m) => m.name === p.label);
                return (
                  <Pressable
                    key={p.label}
                    style={[s.presetChip, exists && s.presetChipUsed]}
                    onPress={() => !exists && applyPreset(p)}
                    disabled={exists}
                  >
                    <Text style={s.presetIcon}>{p.icon}</Text>
                    <Text style={[s.presetLabel, exists && { color: colors.textFaint }]}>{p.label}</Text>
                    {exists && <Ionicons name="checkmark" size={11} color={colors.textFaint} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Add form ── */}
        {showForm && (
          <View style={[s.card, shadow.card, s.formCard]}>
            <Text style={s.sectionLabel}>NEW ITEM</Text>

            <View style={s.formRow}>
              <Text style={s.formLabel}>ICON (emoji)</Text>
              <TextInput
                style={[s.textInput, { width: 60, textAlign: 'center', fontSize: 20 }]}
                value={formIcon}
                onChangeText={setFormIcon}
                placeholder="🎉"
                placeholderTextColor={colors.textFaint}
                maxLength={4}
              />
            </View>

            <View style={s.formRow}>
              <Text style={s.formLabel}>NAME</Text>
              <TextInput
                style={[s.textInput, { flex: 1 }]}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Late Night Surcharge"
                placeholderTextColor={colors.textFaint}
                returnKeyType="next"
              />
            </View>

            <View style={s.formRow}>
              <Text style={s.formLabel}>PRICE ($)</Text>
              <TextInput
                style={[s.textInput, { width: 90 }]}
                value={formPrice}
                onChangeText={setFormPrice}
                placeholder="5.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>

            <View style={s.formRow}>
              <Text style={s.formLabel}>TYPE</Text>
              <View style={s.typeChips}>
                {PRICING_TYPES.map((pt) => (
                  <Pressable
                    key={pt.value}
                    style={[s.typeChip, formPricingType === pt.value && s.typeChipActive]}
                    onPress={() => setFormPricingType(pt.value)}
                  >
                    <Text style={[s.typeChipText, formPricingType === pt.value && s.typeChipTextActive]}>
                      {pt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {(formPricingType === 'per_unit' || formPricingType === 'per_minute' || formPricingType === 'per_stop') && (
              <View style={s.formRow}>
                <Text style={s.formLabel}>UNIT LABEL</Text>
                <TextInput
                  style={[s.textInput, { width: 120 }]}
                  value={formUnitLabel}
                  onChangeText={setFormUnitLabel}
                  placeholder={formPricingType === 'per_minute' ? 'min' : formPricingType === 'per_stop' ? 'stop' : 'unit'}
                  placeholderTextColor={colors.textFaint}
                  returnKeyType="done"
                />
              </View>
            )}

            <TouchableOpacity
              style={[s.addItemBtn, adding && s.addItemBtnDisabled]}
              onPress={addItem}
              disabled={adding}
              activeOpacity={0.85}
            >
              {adding
                ? <ActivityIndicator size="small" color={colors.bg} />
                : <Text style={s.addItemBtnText}>ADD TO MENU</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Menu items ── */}
        {menu.length > 0 ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>YOUR MENU</Text>
            <View style={[s.card, shadow.card]}>
              {menu.map((item, idx) => (
                <View key={item.id}>
                  {idx > 0 && <View style={s.divider} />}
                  <View style={s.itemRow}>
                    <Text style={s.itemIcon}>{item.icon || '🎯'}</Text>
                    <View style={s.itemInfo}>
                      <Text style={[s.itemName, !item.is_active && { color: colors.textFaint }]}>
                        {item.name}
                      </Text>
                      <Text style={s.itemMeta}>
                        ${Number(item.price).toFixed(2)}
                        {item.unit_label ? ` / ${item.unit_label}` : ''}
                        {' · '}
                        {item.pricing_type.replace('_', ' ')}
                      </Text>
                    </View>
                    <Switch
                      value={item.is_active}
                      onValueChange={() => toggleItem(item)}
                      trackColor={{ false: toggle.trackOff, true: toggle.green.trackOn }}
                      thumbColor={item.is_active ? toggle.green.thumbOn : toggle.thumbOff}
                      ios_backgroundColor={toggle.trackOff}
                    />
                    <TouchableOpacity
                      style={s.deleteBtn}
                      onPress={() => confirmRemove(item)}
                      disabled={acting === item.id}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {acting === item.id
                        ? <ActivityIndicator size="small" color={colors.red} />
                        : <Ionicons name="trash-outline" size={16} color={colors.textFaint} />
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🍽️</Text>
            <Text style={s.emptyTitle}>No menu items yet</Text>
            <Text style={s.emptyBody}>
              Add extras riders can request — stops, late-night surcharges, pet fees, and more.
            </Text>
          </View>
        )}

        {/* Upgrade nudge */}
        {atLimit && tier !== 'hmu_first' && (
          <View style={s.upgradeCard}>
            <Ionicons name="star" size={16} color={colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={s.upgradeTitle}>Unlimited Items with HMU First</Text>
              <Text style={s.upgradeSub}>Free plan maxes out at {maxItems} items.</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.green} />
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  navSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: colors.greenDim, borderWidth: 1, borderColor: colors.greenBorder,
  },
  addBtnDisabled: { backgroundColor: colors.cardAlt, borderColor: colors.border },

  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },

  section: { marginBottom: spacing.xl },
  sectionLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 3, marginBottom: spacing.md },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },

  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },

  presetScroll: { paddingBottom: spacing.xs, gap: spacing.sm },
  presetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.card, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.borderStrong,
  },
  presetChipUsed: { opacity: 0.4 },
  presetIcon: { fontSize: 14 },
  presetLabel: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary },

  formCard: { padding: spacing.xl, marginBottom: spacing.xl },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  formLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 2, width: 80 },
  textInput: {
    fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderStrong,
  },

  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, flex: 1 },
  typeChip: {
    backgroundColor: colors.cardAlt, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.greenDim, borderColor: colors.greenBorder },
  typeChipText: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary },
  typeChipTextActive: { color: colors.green },

  addItemBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.md,
  },
  addItemBtnDisabled: { opacity: 0.5 },
  addItemBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1 },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  itemIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  itemInfo: { flex: 1 },
  itemName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  itemMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  deleteBtn: { paddingHorizontal: spacing.sm },

  empty: { alignItems: 'center', paddingTop: 48, paddingBottom: 32 },
  emptyEmoji: { fontSize: 40, marginBottom: spacing.md },
  emptyTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 22 },

  upgradeCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.greenDim, borderRadius: radius.cardInner,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.greenBorder,
    marginTop: spacing.md,
  },
  upgradeTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.green },
  upgradeSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, marginTop: 2 },
});
