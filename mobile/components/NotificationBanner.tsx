import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppNotification, useNotifications } from '@/contexts/notifications';
import { colors, fonts, radius } from '@/lib/theme';

const DURATION = 4200;

function accentColor(type: AppNotification['type']): string {
  switch (type) {
    case 'new_request': return colors.green;
    case 'matched': return colors.green;
    case 'cancelled': return colors.red;
    case 'ride_status': return colors.blue;
    default: return colors.amber;
  }
}

export function NotificationBanner() {
  const { currentBanner, dismissBanner } = useNotifications();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const slideY = useRef(new Animated.Value(-140)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentBanner) {
      slideY.setValue(-140);
      return;
    }

    progressAnim.setValue(1);
    if (timerRef.current) clearTimeout(timerRef.current);

    Animated.spring(slideY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 240,
      mass: 0.8,
    }).start();

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: DURATION,
      useNativeDriver: false,
    }).start();

    timerRef.current = setTimeout(slideOut, DURATION);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBanner?.id]);

  function slideOut() {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.spring(slideY, {
      toValue: -140,
      useNativeDriver: true,
      damping: 20,
      stiffness: 240,
    }).start(() => dismissBanner());
  }

  function handlePress() {
    if (!currentBanner) return;
    slideOut();
    if (currentBanner.route) {
      router.push(currentBanner.route as Parameters<typeof router.push>[0]);
    }
  }

  if (!currentBanner) return null;

  const accent = accentColor(currentBanner.type);
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 10, transform: [{ translateY: slideY }] },
      ]}
    >
      <Pressable onPress={handlePress} android_ripple={{ color: 'rgba(255,255,255,0.05)' }}>
        <View style={[styles.card, { borderColor: `${accent}44` }]}>
          <View style={[styles.accentBar, { backgroundColor: accent }]} />
          <View style={styles.textWrap}>
            <Text style={[styles.title, { color: accent }]}>{currentBanner.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{currentBanner.body}</Text>
          </View>
          <Pressable onPress={slideOut} style={styles.closeHit} hitSlop={14}>
            <Text style={styles.closeX}>✕</Text>
          </Pressable>
          <Animated.View
            style={[styles.progressBar, { backgroundColor: accent, width: progressWidth }]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 20,
  },
  card: {
    backgroundColor: '#1c1c1c',
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 16,
  },
  accentBar: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginRight: 12,
    minHeight: 32,
  },
  textWrap: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 17,
    letterSpacing: 0.5,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  closeHit: {
    paddingLeft: 10,
    paddingVertical: 4,
  },
  closeX: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textFaint,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
  },
});
