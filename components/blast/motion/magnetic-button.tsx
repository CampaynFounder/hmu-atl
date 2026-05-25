'use client';

// MagneticButton — primary CTA whose contents subtly track the cursor on
// desktop. Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5.
//
// - Translates up to ±MAX_OFFSET px toward cursor
// - Disabled on touch via `(hover: hover)` media query
// - Reduced motion: no translate (renders as plain button wrapper)

import { ButtonHTMLAttributes, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

// We can't naively spread `ButtonHTMLAttributes` onto `motion.button` because
// React's animation event handler types collide with Framer's. Pick the most
// common attributes consumers actually need; add more as use cases come up.
type SafeButtonAttrs = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | 'type'
  | 'disabled'
  | 'name'
  | 'value'
  | 'form'
  | 'tabIndex'
  | 'aria-label'
  | 'aria-describedby'
  | 'aria-pressed'
  | 'aria-expanded'
  | 'aria-controls'
  | 'id'
  | 'className'
  | 'style'
  | 'autoFocus'
  | 'role'
> & {
  onClick?: HTMLMotionProps<'button'>['onClick'];
  onFocus?: HTMLMotionProps<'button'>['onFocus'];
  onBlur?: HTMLMotionProps<'button'>['onBlur'];
};

export interface MagneticButtonProps extends SafeButtonAttrs {
  children: ReactNode;
  /** Maximum offset in px (default 4 per contract). */
  maxOffsetPx?: number;
}

export function MagneticButton({ children, maxOffsetPx = 4, ...buttonProps }: MagneticButtonProps) {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hoverEnabled, setHoverEnabled] = useState(false);

  // Feature-detect hover: only enable on devices where (hover: hover) is true.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(hover: hover)');
    const apply = () => setHoverEnabled(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (prefersReduced || !hoverEnabled) return;
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      setOffset({
        x: Math.max(-1, Math.min(1, dx)) * maxOffsetPx,
        y: Math.max(-1, Math.min(1, dy)) * maxOffsetPx,
      });
    },
    [hoverEnabled, prefersReduced, maxOffsetPx],
  );

  const onMouseLeave = useCallback(() => setOffset({ x: 0, y: 0 }), []);

  const animate = prefersReduced || !hoverEnabled
    ? { x: 0, y: 0 }
    : { x: offset.x, y: offset.y };

  return (
    <motion.button
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      animate={animate}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      whileTap={prefersReduced ? undefined : { scale: 0.97 }}
      {...buttonProps}
    >
      {children}
    </motion.button>
  );
}

export default MagneticButton;
