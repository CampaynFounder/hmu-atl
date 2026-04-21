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

// Scoreboard-style count-up. Animates from 0 to `value` with easeOutCubic.
// Uses requestAnimationFrame directly (rather than framer-motion) to stay tiny and
// avoid layout thrash on the StatCard grid where many instances mount at once.
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
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number.isFinite(value) ? value : 0;
    startRef.current = null;

    const tick = (ts: number) => {
      if (startRef.current == null) startRef.current = ts + delay;
      const elapsed = ts - startRef.current;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (to - from) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, delay]);

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
