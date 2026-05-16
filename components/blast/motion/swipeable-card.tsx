'use client';

// SwipeableCard — drag-to-dismiss card primitive.
//
// Original usage (Stream C driver inbox): vertical swipe. Swipe up = HMU,
// swipe down = pass. Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5 + §6.6.
//
// PR 5 extends with a `direction='x'` mode for the rider-side Tinder deck:
// swipe right = HMU that fallback driver, swipe left = dismiss. Rotation
// follows the active axis so both modes feel native; threshold logic +
// velocity escape are shared. Back-compat is total — omitting `direction`
// or any new handler keeps the original behavior.

import { ReactNode, useCallback, useRef, useState } from 'react';
import {
  motion,
  PanInfo,
  useMotionValue,
  useTransform,
  useReducedMotion,
} from 'framer-motion';

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export interface SwipeableCardProps {
  children: ReactNode;
  /**
   * Drag axis. 'y' (default) = vertical (HMU up / pass down).
   * 'x' = horizontal (right = HMU / left = pass) — Tinder-style decks.
   */
  axis?: 'x' | 'y';
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Optional hook for haptic feedback at threshold crossing. */
  onThresholdCross?: (direction: SwipeDirection) => void;
  /** Override the dismiss threshold as a fraction of card size. Default 0.3. */
  thresholdPct?: number;
  className?: string;
  /** ARIA label for the swipeable region. */
  ariaLabel?: string;
}

// Velocity escape — fast flicks fire the swipe even if the offset hasn't
// hit the percent threshold yet. Kept axis-agnostic.
const VELOCITY_ESCAPE_PX_PER_S = 800;

export function SwipeableCard({
  children,
  axis = 'y',
  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,
  onThresholdCross,
  thresholdPct = 0.3,
  className,
  ariaLabel,
}: SwipeableCardProps) {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [thresholdSide, setThresholdSide] = useState<SwipeDirection | null>(null);

  // Tilt slightly with drag for feedback. Capped to ±8deg horizontal,
  // ±6deg vertical (Tinder is more dramatic; vertical inbox is subtler).
  const rotateY = useTransform(y, [-200, 0, 200], [-6, 0, 6]);
  const rotateX = useTransform(x, [-200, 0, 200], [-8, 0, 8]);

  // Active axis controls which range we evaluate.
  const isHorizontal = axis === 'x';

  const sideFromInfo = useCallback(
    (info: PanInfo): SwipeDirection | null => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return null;
      if (isHorizontal) {
        const t = rect.width * thresholdPct;
        if (info.offset.x < -t) return 'left';
        if (info.offset.x > t) return 'right';
        return null;
      }
      const t = rect.height * thresholdPct;
      if (info.offset.y < -t) return 'up';
      if (info.offset.y > t) return 'down';
      return null;
    },
    [isHorizontal, thresholdPct],
  );

  const handleDrag = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const side = sideFromInfo(info);
      if (side !== thresholdSide) {
        setThresholdSide(side);
        if (side && onThresholdCross) onThresholdCross(side);
      }
    },
    [thresholdSide, sideFromInfo, onThresholdCross],
  );

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) {
        setThresholdSide(null);
        return;
      }
      if (isHorizontal) {
        const t = rect.width * thresholdPct;
        if (info.offset.x < -t || info.velocity.x < -VELOCITY_ESCAPE_PX_PER_S) {
          onSwipeLeft?.();
        } else if (info.offset.x > t || info.velocity.x > VELOCITY_ESCAPE_PX_PER_S) {
          onSwipeRight?.();
        }
      } else {
        const t = rect.height * thresholdPct;
        if (info.offset.y < -t || info.velocity.y < -VELOCITY_ESCAPE_PX_PER_S) {
          onSwipeUp?.();
        } else if (info.offset.y > t || info.velocity.y > VELOCITY_ESCAPE_PX_PER_S) {
          onSwipeDown?.();
        }
      }
      setThresholdSide(null);
    },
    [
      isHorizontal,
      thresholdPct,
      onSwipeUp,
      onSwipeDown,
      onSwipeLeft,
      onSwipeRight,
    ],
  );

  if (prefersReduced) {
    // No drag — render static content. Consumers should provide explicit
    // tap targets (HMU / Pass buttons) when this is the case.
    return (
      <div ref={ref} className={className} aria-label={ariaLabel}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={
        isHorizontal
          ? { x, rotate: rotateX, touchAction: 'pan-y' }
          : { y, rotate: rotateY, touchAction: 'pan-x' }
      }
      drag={axis}
      dragConstraints={isHorizontal ? { left: 0, right: 0 } : { top: 0, bottom: 0 }}
      dragElastic={
        isHorizontal ? { left: 0.4, right: 0.4 } : { top: 0.4, bottom: 0.4 }
      }
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      aria-label={ariaLabel}
    >
      {children}
    </motion.div>
  );
}

export default SwipeableCard;
