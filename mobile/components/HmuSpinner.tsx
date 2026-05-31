// Branded HMU loading indicator — U-shape that fills with green from bottom to top.
// Drop-in replacement for ActivityIndicator anywhere a full-screen or card loader is needed.

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, fonts } from '@/lib/theme';
import { Text } from 'react-native';

interface Props {
  size?: number;
}

export function HmuSpinner({ size = 48 }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(180),
        Animated.timing(progress, {
          toValue: 0,
          duration: 320,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.delay(80),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [progress]);

  const stroke = Math.max(3, Math.round(size * 0.15));
  const containerH = Math.round(size * 0.78);

  // Fill height interpolates from 0 → inner height of the U (container minus bottom stroke)
  const fillH = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, containerH - stroke],
  });

  // Glow opacity mirrors fill progress
  const glowOpacity = progress.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 0.35, 0.15],
  });

  return (
    <View style={[s.wrap, { width: size, height: size }]}>
      {/* U outline + fill container */}
      <View
        style={[
          s.uShape,
          {
            width: size,
            height: containerH,
            borderLeftWidth: stroke,
            borderRightWidth: stroke,
            borderBottomWidth: stroke,
            borderBottomLeftRadius: size * 0.52,
            borderBottomRightRadius: size * 0.52,
          },
        ]}
      >
        {/* Rising green fill */}
        <Animated.View
          style={[
            s.fill,
            { height: fillH },
          ]}
        />
      </View>

      {/* Subtle glow halo under the U */}
      <Animated.View
        style={[
          s.glow,
          {
            width: size * 0.6,
            height: stroke * 2,
            bottom: size - containerH - stroke,
            opacity: glowOpacity,
          },
        ]}
      />
    </View>
  );
}

// Full-screen centered spinner with optional label
export function HmuSpinnerScreen({ label }: { label?: string }) {
  return (
    <View style={s.screen}>
      <HmuSpinner size={52} />
      {label ? <Text style={s.label}>{label}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  uShape: {
    borderColor: colors.greenBorder,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: {
    backgroundColor: colors.green,
    width: '100%',
  },
  glow: {
    position: 'absolute',
    backgroundColor: colors.green,
    borderRadius: 4,
    alignSelf: 'center',
    // blur effect via shadow
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textFaint,
    letterSpacing: 2,
    marginTop: 4,
  },
});
