// Rider payment methods — list, add, and remove linked cards.
// GET /api/rider/payment-methods → list
// DELETE /api/rider/payment-methods?id={uuid} → remove card
// Add card → navigates to payment-setup

import { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { PaymentIcon } from 'react-native-payment-icons';
import { colors, fonts, radius, spacing, shadow } from '@/lib/theme';
import { apiClient } from '@/lib/api';

interface PaymentMethod {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  isApplePay: boolean;
  isGooglePay: boolean;
  isCashAppPay: boolean;
}

const BRAND_LABELS: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'MC',
  amex: 'AMEX',
  discover: 'DISC',
  diners: 'DINERS',
  jcb: 'JCB',
  unionpay: 'UNION',
};

const BRAND_COLORS: Record<string, string> = {
  visa: '#1A6FDB',
  mastercard: colors.red,
  amex: '#2E77BC',
  discover: colors.amber,
};

function brandLabel(method: PaymentMethod): string {
  if (method.isApplePay) return 'Apple Pay';
  if (method.isGooglePay) return 'Google Pay';
  if (method.isCashAppPay) return 'Cash App';
  return BRAND_LABELS[method.brand ?? ''] ?? (method.brand?.toUpperCase() ?? 'CARD');
}

function brandColor(method: PaymentMethod): string {
  if (method.isApplePay) return colors.textPrimary;
  if (method.isGooglePay) return colors.blue;
  if (method.isCashAppPay) return '#00C853';
  return BRAND_COLORS[method.brand ?? ''] ?? colors.textFaint;
}

// Map a card brand to a react-native-payment-icons type for the real network
// mark. Wallets (Apple/Google/Cash App) return null — that package has no
// wallet marks, so they keep the styled label until official assets are added.
const BRAND_ICON_TYPE = {
  visa: 'visa', mastercard: 'mastercard', amex: 'amex', american_express: 'amex',
  discover: 'discover', diners: 'diners', diners_club: 'diners', jcb: 'jcb',
  unionpay: 'unionpay', union_pay: 'unionpay', maestro: 'maestro',
} as const;

function cardIconType(method: PaymentMethod): (typeof BRAND_ICON_TYPE)[keyof typeof BRAND_ICON_TYPE] | null {
  if (method.isApplePay || method.isGooglePay || method.isCashAppPay) return null;
  const key = (method.brand ?? '').toLowerCase().replace(/\s+/g, '_');
  return BRAND_ICON_TYPE[key as keyof typeof BRAND_ICON_TYPE] ?? null;
}

// Wallet marks render as a real brand glyph + label (e.g.  Pay), not a plain
// text label — react-native-payment-icons has no wallet art, so we build the
// mark from Ionicons brand glyphs, which always ship with the app.
interface WalletMark {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  bg: string;
}
function walletMark(method: PaymentMethod): WalletMark | null {
  if (method.isApplePay) return { icon: 'logo-apple', label: 'Pay', color: colors.textPrimary, bg: colors.cardAlt };
  if (method.isGooglePay) return { icon: 'logo-google', label: 'Pay', color: colors.blue, bg: colors.blueDim };
  if (method.isCashAppPay) return { icon: 'logo-usd', label: 'Cash App', color: '#00C853', bg: 'rgba(0,200,83,0.10)' };
  return null;
}

export default function PaymentMethods() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await getToken();
      const data = await apiClient<{ methods: PaymentMethod[] }>('/rider/payment-methods', t);
      setMethods(data.methods ?? []);
    } catch {
      setMethods([]);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Switch the active (charged) card by tapping it — no need to delete the old
  // one. The ride hold charges whichever method is is_default on the backend.
  async function makeDefault(method: PaymentMethod) {
    if (method.isDefault || selecting) return;
    setSelecting(method.id);
    const prev = methods;
    setMethods(ms => ms.map(m => ({ ...m, isDefault: m.id === method.id }))); // optimistic
    try {
      const t = await getToken();
      await apiClient(`/rider/payment-methods/${method.id}/default`, t, { method: 'PATCH' });
    } catch (e: any) {
      setMethods(prev); // revert if it didn't persist
      Alert.alert('Error', e.message ?? 'Could not switch payment method');
    } finally {
      setSelecting(null);
    }
  }

  async function removeCard(method: PaymentMethod) {
    Alert.alert(
      'REMOVE CARD',
      `Remove ${brandLabel(method)}${method.last4 ? ` ••••${method.last4}` : ''}? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setRemoving(method.id);
            try {
              const t = await getToken();
              await apiClient(`/rider/payment-methods?id=${method.id}`, t, { method: 'DELETE' });
              setMethods(prev => prev.filter(m => m.id !== method.id));
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Could not remove card');
            } finally {
              setRemoving(null);
            }
          },
        },
      ],
    );
  }

  const expDisplay = (m: PaymentMethod) =>
    m.expMonth && m.expYear
      ? `${String(m.expMonth).padStart(2, '0')}/${String(m.expYear).slice(-2)}`
      : null;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>PAYMENT METHODS</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.green} />
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {methods.length === 0 ? (
            <Animated.View entering={FadeIn.duration(400)} style={s.emptyWrap}>
              <View style={s.emptyIcon}>
                <Ionicons name="card-outline" size={40} color={colors.textFaint} />
              </View>
              <Text style={s.emptyTitle}>NO CARDS LINKED</Text>
              <Text style={s.emptyBody}>
                Add a card to start booking rides. HMU holds payment when a driver accepts — you're only charged at pickup.
              </Text>
            </Animated.View>
          ) : (
            <View style={s.cardsList}>
              {methods.map((m, i) => {
                const color = brandColor(m);
                const exp = expDisplay(m);
                const iconType = cardIconType(m);
                const wallet = walletMark(m);
                return (
                  <Animated.View
                    key={m.id}
                    entering={FadeInUp.delay(i * 60).duration(350)}
                    style={[s.cardRow, shadow.card, m.isDefault && { borderColor: colors.greenBorder }]}
                  >
                    {/* Tap the card to make it the active (charged) method */}
                    <TouchableOpacity
                      style={s.cardTap}
                      onPress={() => makeDefault(m)}
                      disabled={m.isDefault || selecting != null}
                      activeOpacity={0.7}
                    >
                      {/* Brand mark — wallet glyph for Apple/Google/Cash App,
                          real network logo for cards, styled label otherwise. */}
                      {wallet ? (
                        <View style={[s.walletMark, { backgroundColor: wallet.bg, borderColor: `${wallet.color}40` }]}>
                          <Ionicons name={wallet.icon} size={15} color={wallet.color} />
                          <Text style={[s.walletText, { color: wallet.color }]}>{wallet.label}</Text>
                        </View>
                      ) : iconType ? (
                        <View style={s.brandMark}>
                          <PaymentIcon type={iconType} width={48} />
                        </View>
                      ) : (
                        <View style={[s.brandBadge, { backgroundColor: `${color}18`, borderColor: `${color}40` }]}>
                          <Text style={[s.brandText, { color }]}>{brandLabel(m)}</Text>
                        </View>
                      )}

                      <View style={s.cardInfo}>
                        <Text style={s.cardNumber}>
                          {m.last4 ? `•••• ${m.last4}` : brandLabel(m)}
                        </Text>
                        <View style={s.cardMeta}>
                          {exp && <Text style={s.cardExp}>Exp {exp}</Text>}
                          {selecting === m.id ? (
                            <ActivityIndicator size="small" color={colors.green} />
                          ) : m.isDefault ? (
                            <View style={s.defaultBadge}>
                              <Text style={s.defaultText}>DEFAULT</Text>
                            </View>
                          ) : (
                            <Text style={s.tapHint}>TAP TO USE</Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Remove */}
                    {!m.isDefault || methods.length > 1 ? (
                      <TouchableOpacity
                        style={s.removeBtn}
                        onPress={() => removeCard(m)}
                        disabled={removing === m.id}
                        hitSlop={8}
                      >
                        {removing === m.id
                          ? <ActivityIndicator size="small" color={colors.red} />
                          : <Ionicons name="trash-outline" size={18} color={colors.textFaint} />
                        }
                      </TouchableOpacity>
                    ) : (
                      <View style={{ width: 32 }} />
                    )}
                  </Animated.View>
                );
              })}
            </View>
          )}

          {/* Add card CTA */}
          <Animated.View entering={FadeInUp.delay(methods.length * 60 + 100).duration(350)}>
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => router.push('/(rider)/payment-setup' as never)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.green} />
              <Text style={s.addBtnText}>ADD PAYMENT METHOD</Text>
            </TouchableOpacity>
          </Animated.View>

          <Text style={s.secureNote}>
            Secured by Stripe · Your card number is never stored on HMU servers
          </Text>
        </ScrollView>
      )}
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
  headerTitle: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 1.5 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg },

  emptyWrap: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  emptyIcon: {
    width: 80, height: 80, borderRadius: radius.card,
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  emptyTitle: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.textSecondary, letterSpacing: 1 },
  emptyBody: {
    fontFamily: fonts.body, fontSize: 13, color: colors.textTertiary,
    textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.lg,
  },

  cardsList: { gap: spacing.md },
  cardRow: {
    backgroundColor: colors.card, borderRadius: radius.card,
    padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandBadge: {
    width: 54, height: 34, borderRadius: radius.tag,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  brandMark: { width: 54, height: 34, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.5 },
  walletMark: {
    minWidth: 54, height: 34, borderRadius: radius.tag, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 8,
  },
  walletText: { fontFamily: fonts.bodySemiBold, fontSize: 12, letterSpacing: 0.2 },
  cardInfo: { flex: 1, gap: 4 },
  cardNumber: { fontFamily: fonts.mono, fontSize: 14, color: colors.textPrimary, letterSpacing: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardExp: { fontFamily: fonts.mono, fontSize: 10, color: colors.textFaint },
  defaultBadge: {
    backgroundColor: colors.greenDim, borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: colors.greenBorder,
  },
  defaultText: { fontFamily: fonts.mono, fontSize: 8, color: colors.green, letterSpacing: 1 },
  tapHint: { fontFamily: fonts.mono, fontSize: 8, color: colors.textFaint, letterSpacing: 1 },
  removeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, borderRadius: radius.pill,
    paddingVertical: 15, backgroundColor: colors.greenDim,
    borderWidth: 1, borderColor: colors.greenBorder,
  },
  addBtnText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.green, letterSpacing: 1.5 },

  secureNote: {
    fontFamily: fonts.body, fontSize: 11, color: colors.textFaint,
    textAlign: 'center', lineHeight: 16,
  },
});
