'use client';

// Stream A — small reusable form controls for the blast bottom-sheet flow.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §5.1 (mobile-first) + §5.5 (frontend
// feel bar) + §6.6 (animation moments). These intentionally live next to
// the form rather than in the global UI library because they encode blast-
// specific affordances (e.g. chip group with "make this strict" toggle).
//
// Reuse policy: address autocomplete and other shared primitives come from
// existing files (components/ride/address-autocomplete, components/blast/
// motion/*). These controls are the glue.

import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// ─── Chip ────────────────────────────────────────────────────────────────────
// Small selectable pill used for trip type, datetime presets, gender chips,
// driver pref, etc. Tap morphs scale + color smoothly so even sub-300ms
// taps feel deliberate (per §5.5 "zero dead interactions").

export interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** When true, render as a square block (for grid layouts), else flex pill. */
  block?: boolean;
  ariaLabel?: string;
}

export function Chip({ active, onClick, children, block, ariaLabel }: ChipProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        flex: block ? undefined : 1,
        width: block ? '100%' : undefined,
        padding: '12px 14px',
        borderRadius: 14,
        border: '1.5px solid',
        borderColor: active ? '#00E676' : 'rgba(255,255,255,0.12)',
        background: active ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.04)',
        color: active ? '#00E676' : 'rgba(255,255,255,0.78)',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        cursor: 'pointer',
        transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), color 150ms, border-color 150ms',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </motion.button>
  );
}

// ─── ChipGroup ───────────────────────────────────────────────────────────────
// Generic chip selector. Single or multi.

export interface ChipGroupProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | T[];
  onChange: (value: T | T[]) => void;
  multi?: boolean;
  ariaLabel?: string;
}

export function ChipGroup<T extends string>({ options, value, onChange, multi, ariaLabel }: ChipGroupProps<T>) {
  const selected: Set<T> = multi
    ? new Set(Array.isArray(value) ? value : [])
    : new Set(typeof value === 'string' ? [value as T] : []);

  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map((opt) => (
        <Chip
          key={opt.value}
          active={selected.has(opt.value)}
          onClick={() => {
            if (multi) {
              const next = new Set(selected);
              if (next.has(opt.value)) next.delete(opt.value); else next.add(opt.value);
              onChange(Array.from(next));
            } else {
              onChange(opt.value);
            }
          }}
        >
          {opt.label}
        </Chip>
      ))}
    </div>
  );
}

// ─── PriceStepper ────────────────────────────────────────────────────────────
// +/- $5 stepper. Uses CountUpNumber for the value tween so each tap feels
// intentional. Min $1, no max enforced here (server clamps).

export interface PriceStepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
}

export function PriceStepperButton({ direction, onClick }: { direction: '-' | '+'; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        border: '1.5px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        color: '#fff',
        fontSize: 24,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label={direction === '+' ? 'Increase price' : 'Decrease price'}
    >
      {direction}
    </motion.button>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
// Y/N switch for storage + "make this strict".

export interface ToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

export function Toggle({ value, onChange, ariaLabel }: ToggleProps) {
  const prefersReduced = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      onClick={() => onChange(!value)}
      style={{
        width: 52,
        height: 30,
        borderRadius: 15,
        border: 'none',
        background: value ? '#00E676' : 'rgba(255,255,255,0.15)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <motion.div
        layout={!prefersReduced}
        transition={prefersReduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          position: 'absolute',
          top: 3,
          left: value ? 25 : 3,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#0a0a0a',
        }}
      />
    </button>
  );
}

// ─── PrimaryCta ──────────────────────────────────────────────────────────────
// HMU green CTA with whileTap + glow. Disabled state is dim. Loading state
// preserves width to prevent layout shift (per contract §6.2).

export interface PrimaryCtaProps {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: ReactNode;
  type?: 'button' | 'submit';
  /** Subtle pulse to signal anticipation (e.g. "ready to send"). */
  pulse?: boolean;
}

export function PrimaryCta({ onClick, disabled, loading, children, type = 'button', pulse }: PrimaryCtaProps) {
  const prefersReduced = useReducedMotion();
  const isDisabled = !!disabled || !!loading;
  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{
        width: '100%',
        padding: '16px 20px',
        borderRadius: 16,
        border: 'none',
        background: isDisabled ? 'rgba(255,255,255,0.08)' : '#00E676',
        color: isDisabled ? 'rgba(255,255,255,0.4)' : '#000',
        fontSize: 16,
        fontWeight: 800,
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        letterSpacing: '0.01em',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        boxShadow: isDisabled ? 'none' : '0 0 32px rgba(0,230,118,0.25)',
        animation: !prefersReduced && pulse && !isDisabled ? 'blastCtaPulse 1.6s ease-in-out infinite' : undefined,
        position: 'relative',
        minHeight: 56,
      }}
    >
      {loading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 18,
              height: 18,
              border: '2px solid rgba(0,0,0,0.25)',
              borderTopColor: '#000',
              borderRadius: '50%',
              animation: 'blastCtaSpin 0.6s linear infinite',
            }}
          />
          {children}
        </span>
      ) : (
        children
      )}
      <style>{`
        @keyframes blastCtaPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.92; transform: scale(1.01); }
        }
        @keyframes blastCtaSpin { to { transform: rotate(360deg); } }
      `}</style>
    </motion.button>
  );
}

// ─── ShakeWrap ──────────────────────────────────────────────────────────────
// Wraps a child and shakes it horizontally when `shake` flips true. Used for
// validation errors per §6.6 "Form input → Validation error".

export function ShakeWrap({ shake, children }: { shake: boolean; children: ReactNode }) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      animate={shake && !prefersReduced ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.div>
  );
}
