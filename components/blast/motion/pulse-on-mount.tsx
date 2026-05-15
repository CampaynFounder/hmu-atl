'use client';

// PulseOnMount — wraps children, runs a single attention-getting pulse on
// mount. Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5.
//
// scale 0.96 → 1.04 → 1.0 over 600ms; opacity 0 → 1
// Reduced motion: opacity-only fade.

import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface PulseOnMountProps {
  children: ReactNode;
  className?: string;
  /** Override the scale animation duration in seconds (default 0.6). */
  durationSec?: number;
}

export function PulseOnMount({ children, className, durationSec = 0.6 }: PulseOnMountProps) {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) {
    return (
      <motion.div
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: [0.96, 1.04, 1.0] }}
      transition={{ duration: durationSec, times: [0, 0.6, 1], ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export default PulseOnMount;
