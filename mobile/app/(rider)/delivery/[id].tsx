// Active delivery tracker — customer view.
// Route: /(rider)/delivery/[id]
// Polls delivery status every 10s + Ably updates.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useStableToken } from '@/hooks/use-stable-token';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';
import { useAbly } from '@/hooks/use-ably';
import type { DeliveryRequest } from '@/shared/delivery-types';
import {
  DELIVERY_STATUS_STEPS,
  getDeliveryStatusLabel,
  getDeliveryStatusSubtitle,
  isActiveDelivery,
} from '@/shared/delivery-state-machine';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ActiveDeliveryRider() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const getToken = useStableToken();
  const { user } = useUser();

  const [delivery, setDelivery] = useState<DeliveryRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const userId = user?.publicMetadata?.databaseId as string | undefined;

  useEffect(() => {
    getToken().then(setToken).catch(() => {});
    const iv = setInterval(() => getToken().then(setToken).catch(() => {}), 60_000);
    return () => clearInterval(iv);
  }, [getToken]);

  const fetchDelivery = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<DeliveryRequest>(`/delivery/${id}`, t);
      setDelivery(data);
    } catch {
      // silently ignore poll failures
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => {
    void fetchDelivery();
    const iv = setInterval(() => { void fetchDelivery(); }, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [fetchDelivery]);

  useAbly({
    channelName: userId ? `user:${userId}:notify` : null,
    token,
    onMessage: (msg) => {
      if (msg.name === 'delivery_update') {
        void fetchDelivery();
      }
    },
  });

  async function handleVerify() {
    if (pinInput.length !== 4) {
      Alert.alert('Enter your 4-digit PIN', 'The courier will tell you the PIN when they arrive.');
      return;
    }
    setVerifying(true);
    try {
      const t = await getToken();
      await apiClient(`/delivery/${id}/verify`, t, {
        method: 'POST',
        body: JSON.stringify({ pin: pinInput }),
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void fetchDelivery();
    } catch (e: any) {
      Alert.alert('Incorrect PIN', e.message ?? 'Check the PIN with your courier.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleCancel() {
    Alert.alert(
      'Cancel Delivery',
      'Are you sure? Your courier may already be heading to the merchant.',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const t = await getToken();
              await apiClient(`/delivery/${id}/cancel`, t, { method: 'POST' });
              router.back();
            } catch (e: any) {
              Alert.alert('Could not cancel', e.message ?? 'Try again');
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  }

  if (loading || !delivery) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.pink} />
      </View>
    );
  }

  const statusIdx = DELIVERY_STATUS_STEPS.indexOf(delivery.status as any);
  const isActive = isActiveDelivery(delivery.status as any);
  const isDelivered = delivery.status === 'delivered';
  const isCompleted = delivery.status === 'completed';
  const isCancelled = delivery.status === 'cancelled';

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
        <Text style={s.headerTitle}>YOUR DELIVERY</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Status Banner */}
      <Animated.View entering={FadeIn.duration(400)} style={[s.statusBanner, isCancelled && s.cancelledBanner]}>
        <View style={s.statusDotRow}>
          {isActive && <View style={[s.statusDot, { backgroundColor: colors.pink }]} />}
          <Text style={[s.statusLabel, isCancelled && { color: colors.red }]}>
            {getDeliveryStatusLabel(delivery.status as any)}
          </Text>
        </View>
        <Text style={s.statusSub}>{getDeliveryStatusSubtitle(delivery.status as any)}</Text>
      </Animated.View>

      {/* Progress Steps */}
      {!isCancelled && (
        <View style={[s.card, shadow.card]}>
          {DELIVERY_STATUS_STEPS.filter(s => s !== 'completed').map((step, i) => {
            const done = statusIdx > i;
            const active = statusIdx === i;
            return (
              <View key={step} style={s.stepRow}>
                <View style={[s.stepCircle, done && s.stepDone, active && s.stepActive]}>
                  {done
                    ? <Ionicons name="checkmark" size={12} color={colors.bg} />
                    : <View style={[s.stepDot, active && { backgroundColor: colors.pink }]} />
                  }
                </View>
                {i < DELIVERY_STATUS_STEPS.length - 2 && (
                  <View style={[s.stepLine, done && s.stepLineDone]} />
                )}
                <Text style={[s.stepLabel, (done || active) && s.stepLabelActive]}>
                  {getDeliveryStatusLabel(step)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Courier Card */}
      {delivery.courierHandle && (
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>YOUR COURIER</Text>
          <View style={s.courierRow}>
            {delivery.courierAvatarUrl
              ? <Image source={{ uri: delivery.courierAvatarUrl }} style={s.avatar} />
              : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <Text style={s.avatarLetter}>{(delivery.courierHandle?.[0] ?? '?').toUpperCase()}</Text>
                </View>
              )
            }
            <View style={s.courierInfo}>
              <Text style={s.courierHandle}>@{delivery.courierHandle}</Text>
              {delivery.courierName && (
                <Text style={s.courierName}>{delivery.courierName}</Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Receipt (once uploaded) */}
      {delivery.receiptUrl && (
        <View style={[s.card, shadow.card]}>
          <Text style={s.cardLabel}>RECEIPT</Text>
          <Image source={{ uri: delivery.receiptUrl }} style={s.receiptImg} resizeMode="contain" />
          {delivery.receiptTotal && (
            <View style={s.receiptTotal}>
              <Text style={s.receiptTotalLabel}>ACTUAL TOTAL</Text>
              <Text style={s.receiptTotalValue}>${delivery.receiptTotal.toFixed(2)}</Text>
            </View>
          )}
        </View>
      )}

      {/* PIN Verification */}
      {isDelivered && (
        <View style={[s.pinCard, shadow.card]}>
          <Text style={s.pinTitle}>CONFIRM DELIVERY</Text>
          <Text style={s.pinSub}>Ask your courier for the 4-digit PIN to release their payment.</Text>
          <View style={s.pinRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.pinDigit, pinInput.length > i && s.pinDigitFilled]}>
                <Text style={s.pinDigitText}>{pinInput[i] ?? '·'}</Text>
              </View>
            ))}
          </View>
          <View style={s.numpad}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
              <TouchableOpacity
                key={i}
                style={[s.numKey, key === '' && { opacity: 0 }]}
                onPress={() => {
                  if (key === '⌫') setPinInput(p => p.slice(0, -1));
                  else if (key && pinInput.length < 4) setPinInput(p => p + key);
                }}
                disabled={key === ''}
                activeOpacity={0.7}
              >
                <Text style={s.numKeyText}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[s.verifyBtn, (pinInput.length < 4 || verifying) && s.disabled]}
            onPress={handleVerify}
            disabled={pinInput.length < 4 || verifying}
            activeOpacity={0.85}
          >
            {verifying
              ? <ActivityIndicator size="small" color={colors.bg} />
              : <Text style={s.verifyBtnText}>CONFIRM RECEIPT ✓</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {/* Completed */}
      {isCompleted && (
        <View style={[s.card, s.completedCard, shadow.card]}>
          <Ionicons name="checkmark-circle" size={40} color={colors.green} />
          <Text style={s.completedTitle}>DELIVERED</Text>
          <Text style={s.completedSub}>Your courier has been paid. Thanks for using HMU Pickup!</Text>
        </View>
      )}

      {/* Cancel */}
      {isActive && !isDelivered && (
        <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} disabled={cancelling} activeOpacity={0.8}>
          {cancelling
            ? <ActivityIndicator size="small" color={colors.red} />
            : <Text style={s.cancelBtnText}>CANCEL REQUEST</Text>
          }
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, paddingBottom: 60, gap: spacing.md },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.textPrimary, letterSpacing: 1 },

  statusBanner: {
    backgroundColor: colors.pinkDim, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.pinkBorder, padding: spacing.xl, gap: spacing.sm,
  },
  cancelledBanner: { backgroundColor: colors.redDim, borderColor: colors.redBorder },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontFamily: fonts.display, fontSize: 22, color: colors.pink, letterSpacing: 1 },
  statusSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, lineHeight: 20 },

  card: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.md,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 9, color: colors.textFaint, letterSpacing: 2 },

  // Progress steps
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDone: { backgroundColor: colors.green, borderColor: colors.green },
  stepActive: { borderColor: colors.pink, borderWidth: 2 },
  stepDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textFaint },
  stepLine: { position: 'absolute', left: 10, top: 22, width: 2, height: 16, backgroundColor: colors.border },
  stepLineDone: { backgroundColor: colors.green },
  stepLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1, flex: 1 },
  stepLabelActive: { color: colors.textPrimary },

  // Courier
  courierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontFamily: fonts.display, fontSize: 24, color: colors.pink },
  courierInfo: { flex: 1 },
  courierHandle: { fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary },
  courierName: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },

  // Receipt
  receiptImg: { width: '100%', height: 200, borderRadius: radius.cardInner, backgroundColor: colors.cardAlt },
  receiptTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  receiptTotalLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5 },
  receiptTotalValue: { fontFamily: fonts.display, fontSize: 28, color: colors.textPrimary },

  // PIN
  pinCard: {
    backgroundColor: colors.card, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.pinkBorder, padding: spacing.xl,
    alignItems: 'center', gap: spacing.lg,
  },
  pinTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.pink, letterSpacing: 1 },
  pinSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 },
  pinRow: { flexDirection: 'row', gap: spacing.md },
  pinDigit: {
    width: 52, height: 60, borderRadius: radius.cardInner,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pinDigitFilled: { borderColor: colors.pink, backgroundColor: colors.pinkDim },
  pinDigitText: { fontFamily: fonts.display, fontSize: 32, color: colors.textPrimary },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: 220, gap: spacing.sm },
  numKey: {
    width: 64, height: 48, borderRadius: radius.cardInner,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  numKeyText: { fontFamily: fonts.display, fontSize: 22, color: colors.textPrimary },
  verifyBtn: {
    backgroundColor: colors.green, borderRadius: radius.pill,
    paddingVertical: 16, paddingHorizontal: spacing.xxxl,
    alignItems: 'center',
  },
  verifyBtnText: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.bg, letterSpacing: 1.5 },
  disabled: { opacity: 0.4 },

  // Completed
  completedCard: { alignItems: 'center', gap: spacing.md, borderColor: colors.greenBorder, backgroundColor: colors.greenDim },
  completedTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.green, letterSpacing: 2 },
  completedSub: { fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 },

  cancelBtn: {
    alignItems: 'center', paddingVertical: spacing.lg,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.redBorder,
  },
  cancelBtnText: { fontFamily: fonts.mono, fontSize: 12, color: colors.red, letterSpacing: 1.5 },
});
