'use client';

import { useEffect, useRef, useState } from 'react';

interface CountUpProps {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  thousandsSeparator?: boolean;
}

// Scoreboard-style count-up. Animates from 0 to `value` ONCE on first mount.
// Subsequent value changes (e.g. from polling or a parent re-render that happens
// to pass a new prop identity) snap to the new value without re-animating — this
// prevents the card from appearing to "tick up" again every time something
// upstream causes a re-render.
export function CountUp({
  value,
  duration = 1100,
  delay = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  thousandsSeparator = true,
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    // Only animate once, on first mount. Later value changes swap silently.
    if (hasAnimatedRef.current) {
      setDisplay(Number.isFinite(value) ? value : 0);
      return;
    }

    const to = Number.isFinite(valueRef.current) ? valueRef.current : 0;
    hasAnimatedRef.current = true;
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (startTs == null) startTs = ts + delay;
      const elapsed = ts - startTs;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(to * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Intentionally mount-only: re-animating on every value/delay/duration change
    // causes visible jumps when an upstream poll or token refresh re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the value changes after the initial animation, swap to it silently.
  useEffect(() => {
    if (hasAnimatedRef.current && rafRef.current == null) {
      setDisplay(Number.isFinite(value) ? value : 0);
    }
  }, [value]);

  const formatted = formatNumber(display, decimals, thousandsSeparator);
  return <>{prefix}{formatted}{suffix}</>;
}

function formatNumber(n: number, decimals: number, thousands: boolean): string {
  const fixed = n.toFixed(decimals);
  if (!thousands) return fixed;
  const [int, dec] = fixed.split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec ? `${withCommas}.${dec}` : withCommas;
}
