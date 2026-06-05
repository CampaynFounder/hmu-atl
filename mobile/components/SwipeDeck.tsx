// Generic Tinder-style swipe deck. Content-agnostic: the parent supplies the
// items and a renderCard() for the card body; the deck owns the gesture, the
// stacking transform, and the fly-off animation. Mechanics are lifted verbatim
// from the rider blast deck (app/(rider)/book/blast-deck.tsx) so the driver and
// rider swipe experiences stay identical.
//
// Right swipe → onSwipeRight(item); left swipe → onSwipeLeft(item). The deck is
// driven entirely off the `items` prop so it stays in sync with a live feed
// that refetches (new requests appear, taken/expired ones drop) — there is no
// stale internal cursor to desync.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  runOnJS, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { colors, fonts } from '@/lib/theme';

const { width: W } = Dimensions.get('window');
const SWIPE_THRESHOLD = W * 0.32;

export interface SwipeDeckHandle {
  swipeRight: () => void;
  swipeLeft: () => void;
}

interface CardProps {
  children: ReactNode;
  isTop: boolean;
  stackIndex: number;
  rightLabel: string;
  leftLabel: string;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onRegister?: (handle: SwipeDeckHandle) => void;
}

function Card({
  children, isTop, stackIndex, rightLabel, leftLabel,
  onSwipeRight, onSwipeLeft, onRegister,
}: CardProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // Animate the card off-screen, then consume it once the spring settles so the
  // exit reads as a real swipe rather than a hard cut. Callable from JS (the
  // PASS/HMU buttons) — assigning a shared value from JS still runs the spring
  // on the UI thread.
  const flyRight = useCallback(() => {
    tx.value = withSpring(W * 1.6, { velocity: 800 }, (finished) => {
      if (finished) runOnJS(onSwipeRight)();
    });
  }, [tx, onSwipeRight]);
  const flyLeft = useCallback(() => {
    tx.value = withSpring(-W * 1.6, { velocity: -800 }, (finished) => {
      if (finished) runOnJS(onSwipeLeft)();
    });
  }, [tx, onSwipeLeft]);

  // Expose imperative swipes for the external action buttons while this is the
  // top card. Re-registers whenever the top card changes.
  useEffect(() => {
    if (isTop && onRegister) onRegister({ swipeRight: flyRight, swipeLeft: flyLeft });
  }, [isTop, onRegister, flyRight, flyLeft]);

  const gesture = Gesture.Pan()
    .enabled(isTop)
    .onChange((e) => {
      tx.value += e.changeX;
      ty.value += e.changeY * 0.15;
    })
    .onFinalize((e) => {
      const right = tx.value > SWIPE_THRESHOLD || e.velocityX > 700;
      const left = tx.value < -SWIPE_THRESHOLD || e.velocityX < -700;
      if (right) {
        tx.value = withSpring(W * 1.6, { velocity: e.velocityX }, (finished) => {
          if (finished) runOnJS(onSwipeRight)();
        });
      } else if (left) {
        tx.value = withSpring(-W * 1.6, { velocity: e.velocityX }, (finished) => {
          if (finished) runOnJS(onSwipeLeft)();
        });
      } else {
        tx.value = withSpring(0, { damping: 18 });
        ty.value = withSpring(0, { damping: 18 });
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-W * 0.5, 0, W * 0.5], [-14, 0, 14]);
    const scale = interpolate(stackIndex, [0, 1, 2], [1, 0.95, 0.9]);
    const transY = interpolate(stackIndex, [0, 1, 2], [0, 12, 22]);
    return {
      transform: [
        { translateX: tx.value },
        { translateY: ty.value + transY },
        { rotateZ: `${rotate}deg` },
        { scale },
      ],
    };
  });

  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [0, 80, 160], [0, 0.6, 1], Extrapolation.CLAMP),
  }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(tx.value, [-160, -80, 0], [1, 0.6, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[d.card, cardStyle]}>
        <Animated.View style={[d.indicator, d.indicatorRight, rightStyle]} pointerEvents="none">
          <Animated.Text style={d.indicatorText}>{rightLabel}</Animated.Text>
        </Animated.View>
        <Animated.View style={[d.indicator, d.indicatorLeft, leftStyle]} pointerEvents="none">
          <Animated.Text style={d.indicatorText}>{leftLabel}</Animated.Text>
        </Animated.View>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

interface SwipeDeckProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderCard: (item: T, isTop: boolean) => ReactNode;
  onSwipeRight: (item: T) => void;
  onSwipeLeft: (item: T) => void;
  rightLabel?: string;
  leftLabel?: string;
  /** Rendered below the stack; receives imperative swipe triggers for the top card. */
  renderControls?: (controls: { onLeft: () => void; onRight: () => void; topItem: T | null }) => ReactNode;
}

export function SwipeDeck<T>({
  items, keyExtractor, renderCard, onSwipeRight, onSwipeLeft,
  rightLabel = 'HMU', leftLabel = 'NAH', renderControls,
}: SwipeDeckProps<T>) {
  // Local working copy so a swiped card can animate out before the next render.
  // Reconciled against `items` by id: keep still-present cards in their current
  // order, append newly-arrived ones, drop those gone from the feed.
  const [cards, setCards] = useState<T[]>(items);
  const sig = useMemo(() => items.map(keyExtractor).join('|'), [items, keyExtractor]);

  useEffect(() => {
    setCards((prev) => {
      const propSet = new Set(items.map(keyExtractor));
      const prevSet = new Set(prev.map(keyExtractor));
      const kept = prev.filter((c) => propSet.has(keyExtractor(c)));
      const added = items.filter((i) => !prevSet.has(keyExtractor(i)));
      return [...kept, ...added];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const topHandle = useRef<SwipeDeckHandle | null>(null);

  const consume = useCallback((item: T, dir: 1 | -1) => {
    setCards((prev) => prev.filter((c) => keyExtractor(c) !== keyExtractor(item)));
    if (dir === 1) onSwipeRight(item);
    else onSwipeLeft(item);
  }, [keyExtractor, onSwipeRight, onSwipeLeft]);

  const visible = cards.slice(0, 3);
  const topItem = cards[0] ?? null;

  return (
    <View style={d.wrap}>
      <View style={d.stack}>
        {/* Reverse so the top card (index 0) paints last / on top. */}
        {visible.map((item, i) => (
          <Card
            key={keyExtractor(item)}
            isTop={i === 0}
            stackIndex={i}
            rightLabel={rightLabel}
            leftLabel={leftLabel}
            onSwipeRight={() => consume(item, 1)}
            onSwipeLeft={() => consume(item, -1)}
            onRegister={i === 0 ? (h) => { topHandle.current = h; } : undefined}
          >
            {renderCard(item, i === 0)}
          </Card>
        )).reverse()}
      </View>
      {renderControls?.({
        onLeft: () => topHandle.current?.swipeLeft(),
        onRight: () => topHandle.current?.swipeRight(),
        topItem,
      })}
    </View>
  );
}

const d = StyleSheet.create({
  wrap: { flex: 1 },
  stack: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    width: W - 32,
    top: 0, bottom: 0,
    left: 16, right: 16,
  },
  indicator: {
    position: 'absolute', top: 24, zIndex: 10,
    borderWidth: 4, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6,
  },
  indicatorRight: { right: 24, borderColor: colors.green, transform: [{ rotate: '12deg' }] },
  indicatorLeft: { left: 24, borderColor: colors.red, transform: [{ rotate: '-12deg' }] },
  indicatorText: { fontFamily: fonts.monoBold, fontSize: 26, letterSpacing: 2, color: colors.textPrimary },
});
