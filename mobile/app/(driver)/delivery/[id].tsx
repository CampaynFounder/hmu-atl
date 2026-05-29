// Active delivery workflow — courier view.
// Route: /(driver)/delivery/[id]
// Flow: Navigate → At Merchant → Upload Receipt → En Route → Collect PIN.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image, Linking, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient, API_BASE } from '@/lib/api';
import type { DeliveryRequest } from '@/shared/delivery-types';
import { getDeliveryStatusLabel } from '@/shared/delivery-state-machine';

// Lazy require — expo-image-picker needs a native rebuild to link in Expo Go.
// Must come after all ES imports.
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
} catch {}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ActiveDeliveryCourier() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();

  const [delivery, setDelivery] = useState<DeliveryRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchDelivery = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<DeliveryRequest>(`/delivery/${id}`, t);
      setDelivery(data);
    } catch {}
    finally { setLoading(false); }
  }, [id, getToken]);

  useEffect(() => {
    void fetchDelivery();
    const iv = setInterval(() => { void fetchDelivery(); }, 10_000);
    return () => clearInterval(iv);
  }, [fetchDelivery]);

  async function transition(endpoint: string) {
    setActing(true);
    try {
      const t = await getToken();
      await apiClient(`/delivery/${id}/${endpoint}`, t, { method: 'POST' });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await fetchDelivery();
    } catch (e: any) {
      Alert.alert('Action failed', e.message ?? 'Try again');
    } finally {
      setActing(false);
    }
  }

  async function uploadReceipt() {
    if (!ImagePicker) {
      Alert.alert('Camera unavailable', 'A native build is required to use the camera.');
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access required', 'We need camera access to photograph the receipt.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'] as any,
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const form = new FormData();
      form.append('receipt', { uri: asset.uri, name: 'receipt.jpg', type: 'image/jpeg' } as any);
      const t = await getToken();
      await fetch(`${API_BASE}/delivery/${id}/receipt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
        body: form,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchDelivery();
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Try again');
    } finally {
      setUploading(false);
    }
  }

  function openMaps(lat: number, lng: number) {
    const url = Platform.select({
      ios: `maps://?daddr=${lat},${lng}&dirflg=d`,
      android: `google.navigation:q=${lat},${lng}`,
    }) ?? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Maps unavailable', 'Install Google Maps or Apple Maps.'),
    );
  }

  if (loading || !delivery) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.pink} />
      </View>
    );
  }

  const est = delivery.estimate;

  return (
    <ScrollView
      style={[s.root, { paddingTop: insets.top }]}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>DELIVERY JOB</Text>
        <View style={[s.statusPill, { borderColor: colors.pinkBorder, backgroundColor: colors.pinkDim }]}>
          <Text style={s.statusPillText}>{getDeliveryStatusLabel(delivery.status as any)}</Text>
        </View>
      </View>

      {/* Payout — always visible */}
      <Animated.View entering={FadeIn.duration(400)} style={[s.payoutCard, shadow.card]}>
        <Text style={s.payoutTitle}>YOUR PAYOUT</Text>
        <View style={s.payoutRow}>
          <PayoutCol label="YOU EARN" value={`$${est.courierEarn.toFixed(2)}`} color={colors.green} />
          <View style={s.payoutDivider} />
          <PayoutCol label="YOU ADVANCE" value={`~$${est.courierAdvance.toFixed(2)}`} color={colors.amber} />
          <View style={s.payoutDivider} />
          <PayoutCol label="TAKE HOME" value={`$${est.courierGuaranteed.toFixed(2)}`} color={colors.pink} bold />
        </View>
        <Text style={s.payoutNote}>
          You front ~${est.courierAdvance.toFixed(2)} at the store. You receive ${est.courierGuaranteed.toFixed(2)} total on verified delivery.
        </Text>
      </Animated.View>

      {/* Merchant */}
      <View style={[s.card, shadow.card]}>
        <Text style={s.cardLabel}>MERCHANT</Text>
        <Text style={s.cardTitle}>{delivery.merchantName}</Text>
        <Text style={s.cardSub}>{delivery.merchantAddress}</Text>
        <TouchableOpacity
          style={s.navBtn}
          onPress={() => openMaps(delivery.merchantLat, delivery.merchantLng)}
          activeOpacity={0.85}
        >
          <Ionicons name="navigate" size={14} color={colors.bg} />
          <Text style={s.navBtnText}>NAVIGATE TO MERCHANT</Text>
        </TouchableOpacity>
      </View>

      {/* Items */}
      <View style={[s.card, shadow.card]}>
        <Text style={s.cardLabel}>ITEMS TO PURCHASE ({delivery.items.length})</Text>
        {delivery.items.map((item) => (
          <View key={item.id} style={s.itemRow}>
            <View style={s.itemBullet} />
            <View style={s.itemInfo}>
              <Text style={s.itemName}>{item.quantity}× {item.name}</Text>
              {item.notes ? <Text style={s.itemNotes}>{item.notes}</Text> : null}
              {item.estimatedPrice > 0 ? (
                <Text style={s.itemEst}>est. ${item.estimatedPrice.toFixed(2)}</Text>
              ) : null}
            </View>
          </View>
        ))}
        <Text style={s.itemsNote}>
          Estimated spend: ${est.estimatedMerchantSpend.toFixed(2)}. Keep the receipt — you'll photograph it next.
        </Text>
      </View>

      {/* Customer address (shown once heading there) */}
      {['receipt_uploaded', 'en_route', 'delivered'].includes(delivery.status) && (
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>DELIVER TO</Text>
          <Text style={s.cardSub}>{delivery.customerAddress}</Text>
          <TouchableOpacity
            style={[s.navBtn, { backgroundColor: colors.blue }]}
            onPress={() => openMaps(delivery.customerLat, delivery.customerLng)}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={14} color={colors.bg} />
            <Text style={s.navBtnText}>NAVIGATE TO CUSTOMER</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Receipt */}
      {delivery.receiptUrl ? (
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>UPLOADED RECEIPT</Text>
          <Image source={{ uri: delivery.receiptUrl }} style={s.receiptImg} resizeMode="contain" />
          {delivery.receiptTotal ? (
            <View style={s.receiptTotalRow}>
              <Text style={s.receiptTotalLabel}>OCR TOTAL</Text>
              <Text style={s.receiptTotalValue}>${delivery.receiptTotal.toFixed(2)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Contextual action */}
      <ActionSection
        status={delivery.status}
        acting={acting}
        uploading={uploading}
        onAtMerchant={() => transition('at-merchant')}
        onUploadReceipt={uploadReceipt}
        onEnRoute={() => transition('en-route')}
      />

      {/* Completed */}
      {delivery.status === 'completed' && (
        <View style={[s.card, s.completedCard, shadow.card]}>
          <Ionicons name="checkmark-circle" size={48} color={colors.green} />
          <Text style={s.completedTitle}>DELIVERY COMPLETE</Text>
          <Text style={s.completedSub}>
            Payment of ${est.courierGuaranteed.toFixed(2)} is being released to your account.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Action Section ─────────────────────────────────────────────────────────────

function ActionSection({
  status, acting, uploading, onAtMerchant, onUploadReceipt, onEnRoute,
}: {
  status: string;
  acting: boolean;
  uploading: boolean;
  onAtMerchant: () => void;
  onUploadReceipt: () => void;
  onEnRoute: () => void;
}) {
  if (status === 'courier_accepted') {
    return (
      <ActionCard
        title="ARRIVED AT MERCHANT?"
        body="Tap when you're inside the store and ready to purchase the items."
        cta="I'M AT THE STORE"
        icon="storefront-outline"
        color={colors.amber}
        onPress={onAtMerchant}
        loading={acting}
      />
    );
  }
  if (status === 'at_merchant') {
    return (
      <ActionCard
        title="PURCHASE COMPLETE?"
        body="Photograph the receipt clearly. Our system will read the total automatically."
        cta={uploading ? 'UPLOADING...' : 'TAKE RECEIPT PHOTO'}
        icon="camera-outline"
        color={colors.pink}
        onPress={onUploadReceipt}
        loading={uploading}
      />
    );
  }
  if (status === 'receipt_uploaded') {
    return (
      <ActionCard
        title="HEADING TO CUSTOMER?"
        body="Tap when you've left the merchant and are on your way to deliver the items."
        cta="I'M ON MY WAY"
        icon="bicycle-outline"
        color={colors.blue}
        onPress={onEnRoute}
        loading={acting}
      />
    );
  }
  if (status === 'en_route' || status === 'delivered') {
    return (
      <View style={[s.card, { borderColor: colors.greenBorder, backgroundColor: colors.greenDim }, shadow.card]}>
        <Ionicons name="information-circle-outline" size={20} color={colors.green} />
        <Text style={s.infoText}>
          {status === 'en_route'
            ? "Navigate to the customer. They'll give you a 4-digit PIN to confirm delivery."
            : 'The customer is entering their PIN. Payment releases once confirmed.'}
        </Text>
      </View>
    );
  }
  return null;
}

function ActionCard({
  title, body, cta, icon, color, onPress, loading,
}: {
  title: string;
  body: string;
  cta: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={[s.actionCard, { borderColor: color + '44' }, shadow.card]}>
      <View style={s.actionCardTop}>
        <View style={[s.actionIcon, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.actionTitle}>{title}</Text>
          <Text style={s.actionBody}>{body}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[s.actionBtn, { backgroundColor: color }, loading && s.disabled]}
        onPress={onPress}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator size="small" color={colors.bg} />
          : <Text style={s.actionBtnText}>{cta}</Text>
        }
      </TouchableOpacity>
    </Animated.View>
  );
}

function PayoutCol({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <View style={s.payoutCol}>
      <Text style={s.payoutColLabel}>{label}</Text>
      <Text style={[s.payoutColValue, { color }, bold && { fontFamily: fonts.display, fontSize: 26 }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, paddingBottom: 60, gap: spacing.md },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  headerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.textPrimary, letterSpacing: 1, flex: 1 },
  statusPill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, borderWidth: 1 },
  statusPillText: { fontFamily: fonts.mono, fontSize: 9, color: colors.pink, letterSpacing: 1.5 },

  payoutCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.pinkBorder, padding: spacing.xl, gap: spacing.md,
  },
  payoutTitle: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },
  payoutRow: { flexDirection: 'row', alignItems: 'center' },
  payoutCol: { flex: 1, alignItems: 'center', gap: 4 },
  payoutColLabel: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 1.5, textAlign: 'center' },
  payoutColValue: { fontFamily: fonts.monoBold, fontSize: 18, textAlign: 'center' },
  payoutDivider: { width: 1, height: 40, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  payoutNote: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 18, textAlign: 'center' },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.sm,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },
  cardTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.textPrimary, letterSpacing: 0.5 },
  cardSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },

  navBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.green,
    borderRadius: radius.pill, paddingVertical: 14, marginTop: spacing.sm,
  },
  navBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.bg, letterSpacing: 1.5 },

  itemRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  itemBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.pink, marginTop: 7 },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary },
  itemNotes: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, fontStyle: 'italic' },
  itemEst: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
  itemsNote: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, lineHeight: 18, marginTop: spacing.sm },

  receiptImg: { width: '100%', height: 200, borderRadius: radius.cardInner, backgroundColor: colors.cardAlt },
  receiptTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiptTotalLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5 },
  receiptTotalValue: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary },

  actionCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, padding: spacing.xl, gap: spacing.lg,
  },
  actionCardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  actionIcon: { width: 48, height: 48, borderRadius: radius.cardInner, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.textPrimary, letterSpacing: 0.5, marginBottom: 4 },
  actionBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },
  actionBtn: { borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
  disabled: { opacity: 0.5 },

  infoText: { fontFamily: fonts.body, fontSize: 13, color: colors.green, lineHeight: 20 },

  completedCard: { alignItems: 'center', gap: spacing.md, borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  completedTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.green, letterSpacing: 2 },
  completedSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 },
});
