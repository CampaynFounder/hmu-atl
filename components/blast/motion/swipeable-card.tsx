'use client';

// SwipeableCard — driver-facing offer card with swipe-up = HMU,
// swipe-down = pass. Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5 + §6.6.
//
// Swipe past 30% of card height fires onSwipeUp/onSwipeDown.
// Rubber-band past threshold via dragElastic. Haptic-ready via callback prop.

import { ReactNode, useCallback, useRef, useState } from 'react';
import { motion, PanInfo, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';

export interface SwipeableCardProps {
  children: ReactNode;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  /** Optional hook for haptic feedback at threshold crossing. */
  onThresholdCross?: (direction: 'up' | 'down') => void;
  /** Override the dismiss threshold as a fraction of card height. Default 0.3. */
  thresholdPct?: number;
  className?: string;
  /** ARIA label for the swipeable region. */
  ariaLabel?: string;
}

export function SwipeableCard({
  children,
  onSwipeUp,
  onSwipeDown,
  onThresholdCross,
  thresholdPct = 0.3,
  className,
  ariaLabel,
}: SwipeableCardProps) {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);
  const [thresholdSide, setThresholdSide] = useState<'up' | 'down' | null>(null);

  // Tilt slightly with drag for feedback. Capped to ±6deg.
  const rotate = useTransform(y, [-200, 0, 200], [-6, 0, 6]);

  const handleDrag = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const h = ref.current?.getBoundingClientRect().height ?? 0;
      const t = h * thresholdPct;
      const side = info.offset.y < -t ? 'up' : info.offset.y > t ? 'down' : null;
      if (side !== thresholdSide) {
        setThresholdSide(side);
        if (side && onThresholdCross) onThresholdCross(side);
      }
    },
    [thresholdSide, thresholdPct, onThresholdCross],
  );

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const h = ref.current?.getBoundingClientRect().height ?? 0;
      const t = h * thresholdPct;
      if (info.offset.y < -t || info.velocity.y < -800) {
        if (onSwipeUp) onSwipeUp();
      } else if (info.offset.y > t || info.velocity.y > 800) {
        if (onSwipeDown) onSwipeDown();
      }
      setThresholdSide(null);
    },
    [thresholdPct, onSwipeUp, onSwipeDown],
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
      style={{ y, rotate, touchAction: 'pan-x' }}
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
