'use client';

// SuccessCheckmark — SVG checkmark draw-in, designed to morph from a
// spinner. Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5.
//
// 800ms stroke-dashoffset draw, HMU green, auto-fades after 1.2s.
// Parent renders the spinner→checkmark transition; this just draws the check.

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

export interface SuccessCheckmarkProps {
  /** Diameter of the SVG square in px. Default 32. */
  size?: number;
  /** Stroke + fill color. Defaults to HMU green. */
  color?: string;
  /** When true, schedule auto-fade after autoHideMs. */
  autoHide?: boolean;
  autoHideMs?: number;
  /** Called after auto-hide completes. */
  onHidden?: () => void;
  className?: string;
}

const DRAW_MS = 800;
const DEFAULT_AUTO_HIDE = 1200;

export function SuccessCheckmark({
  size = 32,
  color = '#00E676',
  autoHide = true,
  autoHideMs = DEFAULT_AUTO_HIDE,
  onHidden,
  className,
}: SuccessCheckmarkProps) {
  const prefersReduced = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!autoHide) return;
    const id = setTimeout(() => setVisible(false), DRAW_MS + autoHideMs);
    return () => clearTimeout(id);
  }, [autoHide, autoHideMs]);

  return (
    <AnimatePresence onExitComplete={onHidden}>
      {visible ? (
        <motion.svg
          className={className}
          width={size}
          height={size}
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
          initial={{ opacity: prefersReduced ? 0 : 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="img"
          aria-label="Success"
        >
          <motion.circle
            cx={16}
            cy={16}
            r={14}
            fill="none"
            stroke={color}
            strokeWidth={2}
            initial={{ pathLength: prefersReduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: prefersReduced ? 0 : DRAW_MS / 1000, ease: 'easeInOut' }}
          />
          <motion.path
            d="M9 16.5 L14 21 L23 12"
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: prefersReduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: prefersReduced ? 0 : DRAW_MS / 1000, delay: prefersReduced ? 0 : 0.2, ease: 'easeOut' }}
          />
        </motion.svg>
      ) : null}
    </AnimatePresence>
  );
}

export default SuccessCheckmark;
