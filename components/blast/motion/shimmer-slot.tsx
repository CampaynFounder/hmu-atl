'use client';

// ShimmerSlot — skeleton rectangle with left-to-right gradient shimmer.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5. Use to hint at the shape of
// incoming data; size + radius props should match the eventual content.

import { motion, useReducedMotion } from 'framer-motion';

export interface ShimmerSlotProps {
  width?: number | string;
  height?: number | string;
  /** Border radius in px. Default 8. */
  radius?: number;
  className?: string;
  /** Loop duration in ms (default 1400). */
  durationMs?: number;
}

const BG = '#1a1a1a';
const HIGHLIGHT = 'rgba(255, 255, 255, 0.07)';

export function ShimmerSlot({
  width = '100%',
  height = 16,
  radius = 8,
  className,
  durationMs = 1400,
}: ShimmerSlotProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return (
      <div
        className={className}
        role="status"
        aria-label="Loading"
        style={{
          width,
          height,
          borderRadius: radius,
          background: BG,
          opacity: 0.6,
        }}
      />
    );
  }

  return (
    <div
      className={className}
      role="status"
      aria-label="Loading"
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: radius,
        background: BG,
        overflow: 'hidden',
      }}
    >
      <motion.div
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: durationMs / 1000, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(90deg, transparent 0%, ${HIGHLIGHT} 50%, transparent 100%)`,
        }}
      />
    </div>
  );
}

export default ShimmerSlot;
