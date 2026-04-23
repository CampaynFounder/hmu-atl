'use client';

import { useEffect, useRef } from 'react';
import type confetti from 'canvas-confetti';

interface CelebrationConfettiProps {
  active: boolean;
  variant?: 'cannon' | 'burst';
}

const HMU_PALETTE = [
  '#00E676',
  '#FFD600',
  '#FF4081',
  '#448AFF',
  '#E040FB',
  '#FF6E40',
  '#00E5FF',
];

export default function CelebrationConfetti({
  active,
  variant = 'burst',
}: CelebrationConfettiProps) {
  const firedRef = useRef(false);

  // Preload the canvas-confetti canvas on mount so the first fire doesn't
  // incur canvas-creation lag (which presents as particles appearing before
  // motion starts).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    import('canvas-confetti').then(({ default: c }) => {
      if (cancelled) return;
      c({ particleCount: 0, origin: { x: 0.5, y: 0.5 } });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    if (typeof window === 'undefined') return;
    firedRef.current = true;

    let cancelled = false;
    let rafId: number | null = null;
    const timers: number[] = [];

    import('canvas-confetti').then(({ default: c }) => {
      if (cancelled) return;
      if (variant === 'cannon') {
        fireCannons(c, () => cancelled, (id) => { rafId = id; });
      } else {
        fireRealistic(c, (id) => timers.push(id));
      }
    });

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      timers.forEach((id) => clearTimeout(id));
    };
  }, [active, variant]);

  return null;
}

type ConfettiFn = typeof confetti;

// "Realistic" preset — canvas-confetti's recommended multi-layer recipe
// that ships in their own docs. Five overlapping bursts with different
// velocities, spread, decay, and scalar. The result is continuous motion
// throughout the celebration window: no apex stall, no visible "stuck"
// moment, pieces fill the viewport and flutter down with air resistance.
function fireRealistic(confetti: ConfettiFn, trackTimer: (id: number) => void) {
  const total = 320;
  const base = {
    origin: { x: 0.5, y: 0.72 },
    colors: HMU_PALETTE,
    ticks: 340,
    disableForReducedMotion: true,
    shapes: ['square', 'circle'] as Array<'square' | 'circle'>,
  };

  const shot = (ratio: number, opts: Parameters<ConfettiFn>[0]) => {
    confetti({
      ...base,
      ...opts,
      particleCount: Math.floor(total * ratio),
    });
  };

  // Layer 1 — tight high-velocity core (25% of pieces). Feels like the
  // initial "pop" — lots of fast pieces streaking upward.
  shot(0.25, { spread: 26, startVelocity: 55, scalar: 1.05 });

  // Layer 2 — medium fan-out (20%). Broadens the initial burst.
  shot(0.2, { spread: 60, startVelocity: 50, scalar: 1 });

  // Layer 3 — wide, slow-decay cloud (35%). Small pieces that linger and
  // flutter — this is where the "air paper" feel comes from.
  shot(0.35, { spread: 100, decay: 0.91, scalar: 0.8, startVelocity: 45 });

  // Layer 4 — soft wide drift (10%). Big slow pieces for visual weight.
  shot(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });

  // Layer 5 — tall arcs (10%). A few pieces fired high and hard so the
  // top of the viewport doesn't feel empty.
  shot(0.1, { spread: 120, startVelocity: 48 });

  // 180ms later — second wave from slightly different origin so the moment
  // sustains for ~1.5s instead of collapsing after the initial blast.
  trackTimer(window.setTimeout(() => {
    shot(0.2, { spread: 80, startVelocity: 45, scalar: 0.9, origin: { x: 0.4, y: 0.72 } });
    shot(0.2, { spread: 80, startVelocity: 45, scalar: 0.9, origin: { x: 0.6, y: 0.72 } });
  }, 180));

  // 420ms later — final top-up to extend the celebration.
  trackTimer(window.setTimeout(() => {
    shot(0.15, { spread: 110, startVelocity: 40, scalar: 1, origin: { x: 0.5, y: 0.7 } });
  }, 420));
}

function fireCannons(
  confetti: ConfettiFn,
  isCancelled: () => boolean,
  trackRaf: (id: number) => void
) {
  const duration = 1400;
  const end = Date.now() + duration;

  const tick = () => {
    if (isCancelled()) return;
    const timeLeft = end - Date.now();
    if (timeLeft <= 0) return;

    confetti({
      particleCount: 5,
      angle: 60,
      spread: 70,
      origin: { x: 0, y: 0.92 },
      colors: HMU_PALETTE,
      startVelocity: 58,
      gravity: 0.95,
      drift: 0.15,
      scalar: 1.05,
      ticks: 320,
      shapes: ['square', 'circle'],
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 70,
      origin: { x: 1, y: 0.92 },
      colors: HMU_PALETTE,
      startVelocity: 58,
      gravity: 0.95,
      drift: -0.15,
      scalar: 1.05,
      ticks: 320,
      shapes: ['square', 'circle'],
      disableForReducedMotion: true,
    });

    trackRaf(requestAnimationFrame(tick));
  };

  tick();
}
