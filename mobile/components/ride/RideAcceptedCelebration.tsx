// Celebratory "RIDE ACCEPTED" overlay — the delight moment the rider gets the
// instant a driver accepts their booking. The active-ride screen already loads
// automatically via the Ably `booking_accepted` event; this layers the emotional
// payoff on top: a haptic punch, an animated check + pulse ring, and the driver
// they just locked in (photo, name, chill score). Auto-dismisses into the live
// ride (Pull Up) after a beat, or on tap.
//
// Uses React Native's built-in Animated on PLAIN Views (opacity / transform) —
// native-driven and rock-solid on the New Architecture (Fabric). We deliberately
// do NOT animate SVG props here (that path silently no-ops on Fabric).

import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Image, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, radius, spacing } from '@/lib/theme';

const AUTO_DISMISS_MS = 3000;

export function RideAcceptedCelebration({
  visible,
  driverName,
  driverHandle,
  avatarUrl,
  chillScore,
  completedRides,
  price,
  onDismiss,
}: {
  visible: boolean;
  driverName: string | null;
  driverHandle: string | null;
  avatarUrl: string | null;
  chillScore: number;
  completedRides: number;
  price?: number | null;
  onDismiss: () => void;
}) {
  const backdrop = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.8)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Haptic celebration: a success notification then a light double-tap, so it
    // *feels* like a win the moment it lands.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const tap = setTimeout(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
      180,
    );

    backdrop.setValue(0);
    cardScale.setValue(0.8);
    cardOpacity.setValue(0);
    check.setValue(0);

    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1, friction: 6, tension: 90, useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
      Animated.timing(check, {
        toValue: 1, duration: 420, delay: 120, easing: Easing.out(Easing.back(2)), useNativeDriver: true,
      }),
    ]).start();

    // Expanding pulse ring behind the check — loops a couple of times.
    const pulse = Animated.loop(
      Animated.timing(ring, {
        toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true,
      }),
      { iterations: 2 },
    );
    ring.setValue(0);
    pulse.start();

    dismissTimer.current = setTimeout(handleDismiss, AUTO_DISMISS_MS);

    return () => {
      clearTimeout(tap);
      pulse.stop();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleDismiss() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(cardScale, { toValue: 0.92, duration: 180, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }

  if (!visible) return null;

  const name = driverName || (driverHandle ? `@${driverHandle}` : 'Your driver');
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.4] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.45, 0.15, 0] });
  const checkScale = check.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable style={styles.fill} onPress={handleDismiss}>
          <Animated.View
            style={[styles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}
          >
            {/* Check + pulse ring */}
            <View style={styles.checkWrap}>
              <Animated.View
                style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
              />
              <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
                <Ionicons name="checkmark" size={44} color={colors.bg} />
              </Animated.View>
            </View>

            <Text style={styles.kicker}>LOCKED IN</Text>
            <Text style={styles.title}>RIDE ACCEPTED</Text>

            {/* Driver card */}
            <View style={styles.driverRow}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>
                      {(name.replace('@', '')[0] ?? 'D').toUpperCase()}
                    </Text>
                  </View>
                )}
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName} numberOfLines={1}>{name}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="snow-outline" size={12} color={colors.green} />
                  <Text style={styles.metaText}>{chillScore} chill</Text>
                  {completedRides > 0 && (
                    <>
                      <View style={styles.metaDot} />
                      <Text style={styles.metaText}>{completedRides} rides</Text>
                    </>
                  )}
                </View>
              </View>
              {price != null && price > 0 && (
                <View style={styles.priceTag}>
                  <Text style={styles.priceText}>${price.toFixed(0)}</Text>
                </View>
              )}
            </View>

            <Text style={styles.sub}>Pull up to lock it in 🤝</Text>

            <View style={styles.cta}>
              <Text style={styles.ctaText}>TAP TO CONTINUE</Text>
              <Ionicons name="arrow-forward" size={13} color={colors.green} />
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: {
    width: '100%', maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.greenBorder,
    padding: spacing.xl, paddingTop: spacing.xxl ?? spacing.xl,
    alignItems: 'center',
  },

  checkWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  ring: {
    position: 'absolute', width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.green,
  },
  checkCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center',
  },

  kicker: { fontFamily: fonts.mono, fontSize: 11, color: colors.green, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.display, fontSize: 40, color: colors.textPrimary, lineHeight: 42, marginBottom: spacing.lg },

  driverRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch',
    backgroundColor: colors.cardAlt, borderRadius: radius.cardInner,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.cardAlt },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.greenBorder },
  avatarInitial: { fontFamily: fonts.display, fontSize: 22, color: colors.green },
  driverName: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textFaint },
  priceTag: {
    backgroundColor: colors.greenDim, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.greenBorder,
    paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  priceText: { fontFamily: fonts.mono, fontSize: 14, color: colors.green },

  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.textTertiary, marginBottom: spacing.lg },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctaText: { fontFamily: fonts.mono, fontSize: 11, color: colors.green, letterSpacing: 1.5 },
});
