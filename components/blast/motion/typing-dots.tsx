'use client';

// TypingDots — three dots, opacity cascade 0.3 → 1 → 0.3 over 1.2s with
// 200ms offsets. Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5 + §6.6 (driver
// typing indicator on offer board).

import { motion, useReducedMotion } from 'framer-motion';

export interface TypingDotsProps {
  /** Dot diameter in px (default 6). */
  size?: number;
  /** Dot color (default HMU green). */
  color?: string;
  className?: string;
  /** Accessible label (default "Typing"). */
  ariaLabel?: string;
}

export function TypingDots({ size = 6, color = '#00E676', className, ariaLabel = 'Typing' }: TypingDotsProps) {
  const prefersReduced = useReducedMotion();
  const dotStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    display: 'inline-block',
  };

  if (prefersReduced) {
    return (
      <span
        role="status"
        aria-label={ariaLabel}
        className={className}
        style={{ display: 'inline-flex', gap: size / 2, alignItems: 'center' }}
      >
        <span style={{ ...dotStyle, opacity: 0.7 }} />
        <span style={{ ...dotStyle, opacity: 0.7 }} />
        <span style={{ ...dotStyle, opacity: 0.7 }} />
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={className}
      style={{ display: 'inline-flex', gap: size / 2, alignItems: 'center' }}
    >
      {[0, 0.2, 0.4].map((delay) => (
        <motion.span
          key={delay}
          style={dotStyle}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

export default TypingDots;
