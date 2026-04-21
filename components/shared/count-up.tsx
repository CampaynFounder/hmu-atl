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
  /**
   * When false (default), the tick-up animation runs once on mount and later
   * value changes snap silently. Prevents accidental re-ticks when an upstream
   * poll or token refresh re-renders the parent.
   *
   * When true, every value change re-triggers the easeOutCubic animation from
   * the last-displayed value to the new one. Use this on views where the value
   * change IS the event the user cares about — e.g. a balance refresh or
   * post-cashout total update, where silently snapping to a new number feels
   * broken.
   */
  animateOnChange?: boolean;
}

// Scoreboard-style count-up. Default: animates from 0 to `value` ONCE on first
// mount; later value changes swap silently. Pass animateOnChange to re-tick on
// every change (from the last displayed value, not from 0).
export function CountUp({
  value,
  duration = 1100,
  delay = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  thousandsSeparator = true,
  animateOnChange = false,
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);
  const displayRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Keep a ref of the current display so animate-on-change can start from it
  // without needing it in the effect's dep array.
  displayRef.current = display;

  useEffect(() => {
    // First mount: animate from 0 to value.
    if (hasAnimatedRef.current) {
      return;
    }

    const to = Number.isFinite(valueRef.current) ? valueRef.current : 0;
    hasAnimatedRef.current = true;
    let startTs: number | null = null;
    const from = 0;

    const tick = (ts: number) => {
      if (startTs == null) startTs = ts + delay;
      const elapsed = ts - startTs;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Intentionally mount-only: re-animating on every dep change causes jumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After the initial mount animation, react to value changes — either silently
  // (default) or with a re-animation from the last displayed value.
  useEffect(() => {
    if (!hasAnimatedRef.current) return; // initial mount handles itself
    const to = Number.isFinite(value) ? value : 0;

    if (!animateOnChange) {
      // Silent swap. Cancel any in-flight animation first.
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setDisplay(to);
      return;
    }

    // Animate from current displayed value to new target.
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const from = displayRef.current;
    if (from === to) return;
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (startTs == null) startTs = ts;
      const elapsed = ts - startTs;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, animateOnChange, duration]);

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
