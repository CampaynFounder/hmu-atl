'use client';

// CountUpNumber — rAF-driven lerp from old → new value over 350ms ease-out.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §6.5 + §6.6 (price stepper, score
// breakdown, etc.). Reduced motion: instant change.

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface CountUpNumberProps {
  value: number;
  /** Format the displayed value (e.g. n => `$${n.toFixed(2)}`). */
  formatter?: (n: number) => string;
  /** Override duration in ms (default 350). */
  durationMs?: number;
  /** Inline style override; defaults to Space Mono so stats line up. */
  style?: React.CSSProperties;
  className?: string;
  /** ARIA live region value for screen readers. */
  ariaLabel?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUpNumber({
  value,
  formatter = (n) => String(Math.round(n)),
  durationMs = 350,
  style,
  className,
  ariaLabel,
}: CountUpNumberProps) {
  const prefersReduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const startRef = useRef(value);
  const targetRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(value);
      startRef.current = value;
      targetRef.current = value;
      return;
    }
    if (value === targetRef.current) return;

    startRef.current = display;
    targetRef.current = value;
    startTimeRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      const next = startRef.current + (targetRef.current - startRef.current) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setDisplay(targetRef.current);
      }
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // intentionally exclude `display` — we only want to retarget on `value` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs, prefersReduced]);

  return (
    <span
      className={className}
      style={{ fontFamily: 'Space Mono, ui-monospace, monospace', fontVariantNumeric: 'tabular-nums', ...style }}
      aria-label={ariaLabel}
    >
      {formatter(display)}
    </span>
  );
}

export default CountUpNumber;
