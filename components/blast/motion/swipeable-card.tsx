'use client';

// SwipeableCard — drag-to-dismiss card primitive.
//
// y-axis mode: vertical swipe (driver inbox). Unchanged from original.
//
// x-axis mode: Tinder-style horizontal swipe (rider fallback deck).
// Rewritten to feel native:
//   - No dragConstraints: card follows the finger 1:1
//   - Past threshold: card flies off in the drag direction (not snaps back)
//   - Below threshold: spring returns to center
//   - Optional leftLabel/rightLabel overlays fade in during drag as haptic hint
//   - onSwipeLeft/Right called AFTER the fly-off animation completes so the
//     parent never sees a card teleport

import { ReactNode, useCallback, useRef, useState } from 'react';
import {
  motion,
  PanInfo,
  useMotionValue,
  useTransform,
  useAnimation,
  useReducedMotion,
} from 'framer-motion';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface SwipeableCardProps {
  children: ReactNode;
  axis?: 'x' | 'y';
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onThresholdCross?: (direction: SwipeDirection) => void;
  thresholdPct?: number;
  /** Label shown as a semi-transparent overlay when swiping left. */
  leftLabel?: string;
  /** Label shown as a semi-transparent overlay when swiping right. */
  rightLabel?: string;
  className?: string;
  ariaLabel?: string;
}

const VELOCITY_ESCAPE_PX_PER_S = 600;
// How far off-screen to animate the card on a committed swipe.
const FLY_OFF_X = 600;
const FLY_OFF_Y = 600;
// Rotation applied at fly-off for x-axis mode.
const FLY_ROTATE_DEG = 22;

export function SwipeableCard({
  children,
  axis = 'y',
  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,
  onThresholdCross,
  thresholdPct = 0.3,
  leftLabel,
  rightLabel,
  className,
  ariaLabel,
}: SwipeableCardProps) {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const controls = useAnimation();

  // Shared motion values so overlays can react to drag position.
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const [thresholdSide, setThresholdSide] = useState<SwipeDirection | null>(null);
  const isHorizontal = axis === 'x';

  // Tilt follows drag — more dramatic for x (Tinder) than y (inbox).
  const rotateFromX = useTransform(x, [-250, 0, 250], [-FLY_ROTATE_DEG * 0.4, 0, FLY_ROTATE_DEG * 0.4]);
  const rotateFromY = useTransform(y, [-200, 0, 200], [-6, 0, 6]);

  // Overlay opacities — fade in as drag crosses 30px in either direction.
  const rightOverlayOpacity = useTransform(x, [0, 80], [0, 0.85]);
  const leftOverlayOpacity = useTransform(x, [-80, 0], [0.85, 0]);

  const getThreshold = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return 80; // fallback px
    return isHorizontal ? rect.width * thresholdPct : rect.height * thresholdPct;
  }, [isHorizontal, thresholdPct]);

  const handleDrag = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const t = getThreshold();
      let side: SwipeDirection | null = null;
      if (isHorizontal) {
        if (info.offset.x < -t) side = 'left';
        else if (info.offset.x > t) side = 'right';
      } else {
        if (info.offset.y < -t) side = 'up';
        else if (info.offset.y > t) side = 'down';
      }
      if (side !== thresholdSide) {
        setThresholdSide(side);
        if (side && onThresholdCross) onThresholdCross(side);
      }
    },
    [thresholdSide, getThreshold, isHorizontal, onThresholdCross],
  );

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setThresholdSide(null);
      const t = getThreshold();

      if (isHorizontal) {
        const goLeft =
          info.offset.x < -t || info.velocity.x < -VELOCITY_ESCAPE_PX_PER_S;
        const goRight =
          info.offset.x > t || info.velocity.x > VELOCITY_ESCAPE_PX_PER_S;

        if (goLeft) {
          // Fly off left, then notify parent.
          void controls
            .start({
              x: -FLY_OFF_X,
              rotate: -FLY_ROTATE_DEG,
              opacity: 0,
              transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
            })
            .then(() => onSwipeLeft?.());
        } else if (goRight) {
          void controls
            .start({
              x: FLY_OFF_X,
              rotate: FLY_ROTATE_DEG,
              opacity: 0,
              transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
            })
            .then(() => onSwipeRight?.());
        } else {
          // Below threshold — spring back.
          void controls.start({
            x: 0,
            rotate: 0,
            opacity: 1,
            transition: { type: 'spring', stiffness: 300, damping: 26, restDelta: 0.5 },
          });
        }
        return;
      }

      // y-axis (driver inbox) — unchanged behaviour.
      if (info.offset.y < -t || info.velocity.y < -VELOCITY_ESCAPE_PX_PER_S) {
        onSwipeUp?.();
      } else if (info.offset.y > t || info.velocity.y > VELOCITY_ESCAPE_PX_PER_S) {
        onSwipeDown?.();
      }
    },
    [controls, getThreshold, isHorizontal, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown],
  );

  if (prefersReduced) {
    return (
      <div ref={ref} className={className} aria-label={ariaLabel}>
        {children}
      </div>
    );
  }

  if (isHorizontal) {
    return (
      <motion.div
        ref={ref}
        className={className}
        style={{ x, rotate: rotateFromX, touchAction: 'pan-y', position: 'relative' }}
        animate={controls}
        drag="x"
        dragMomentum={false}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        aria-label={ariaLabel}
      >
        {/* Right-swipe overlay (HMU) */}
        {rightLabel && (
          <motion.div
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              zIndex: 10,
              opacity: rightOverlayOpacity,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                fontSize: 28,
                fontWeight: 900,
                color: '#00E676',
                border: '3px solid #00E676',
                borderRadius: 8,
                padding: '2px 10px',
                letterSpacing: 2,
                textTransform: 'uppercase',
                display: 'block',
                transform: 'rotate(-12deg)',
              }}
            >
              {rightLabel}
            </span>
          </motion.div>
        )}
        {/* Left-swipe overlay (Nah) */}
        {leftLabel && (
          <motion.div
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              zIndex: 10,
              opacity: leftOverlayOpacity,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
                fontSize: 28,
                fontWeight: 900,
                color: 'rgba(255,80,80,0.9)',
                border: '3px solid rgba(255,80,80,0.9)',
                borderRadius: 8,
                padding: '2px 10px',
                letterSpacing: 2,
                textTransform: 'uppercase',
                display: 'block',
                transform: 'rotate(12deg)',
              }}
            >
              {leftLabel}
            </span>
          </motion.div>
        )}
        {children}
      </motion.div>
    );
  }

  // y-axis mode — original implementation.
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ y, rotate: rotateFromY, touchAction: 'pan-x' }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.4, bottom: 0.4 }}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      aria-label={ariaLabel}
    >
      {children}
    </motion.div>
  );
}

export default SwipeableCard;
