'use client';

// CountdownRing — circular SVG countdown with stroke-dashoffset animation.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5 + §5.2.
//
// Color shifts at 5 min (amber #FFB300) and 1 min (red #FF4444).
// Smoothly updates without re-mount as secondsRemaining ticks down.

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface CountdownRingProps {
  secondsRemaining: number;
  totalSeconds: number;
  /** Diameter in px (default 64). */
  size?: number;
  /** Stroke width in px (default 4). */
  strokeWidth?: number;
  className?: string;
  /** Optional label rendered inside the ring (e.g. mm:ss). */
  label?: string;
}

const COLOR_NORMAL = '#00E676';
const COLOR_AMBER = '#FFB300';
const COLOR_RED = '#FF4444';

function pickColor(secondsRemaining: number): string {
  if (secondsRemaining <= 60) return COLOR_RED;
  if (secondsRemaining <= 300) return COLOR_AMBER;
  return COLOR_NORMAL;
}

export function CountdownRing({
  secondsRemaining,
  totalSeconds,
  size = 64,
  strokeWidth = 4,
  className,
  label,
}: CountdownRingProps) {
  const prefersReduced = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const remaining = Math.max(0, secondsRemaining);
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, remaining / totalSeconds)) : 0;
  const dashOffset = useMemo(() => circumference * (1 - progress), [circumference, progress]);
  const color = pickColor(remaining);

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(remaining)} seconds remaining`}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress — rotated -90deg so it starts at the top */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: dashOffset, stroke: color }}
          transition={prefersReduced ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {label ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            fontFamily: 'Space Mono, ui-monospace, monospace',
            fontVariantNumeric: 'tabular-nums',
            fontSize: Math.round(size * 0.22),
          }}
          aria-hidden="true"
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

export default CountdownRing;
