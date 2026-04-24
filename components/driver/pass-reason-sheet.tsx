'use client';

import { useState } from 'react';

export type PassReason = 'price' | 'distance' | 'booked' | 'other';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: PassReason | null, message: string) => Promise<void> | void;
  /** Name shown in prompt copy, e.g. "the rider" or a driver's pronoun. */
  submittingLabel?: string;
}

const MAX_MESSAGE = 140;

const REASONS: Array<{ key: PassReason; label: string; sub: string }> = [
  { key: 'price',    label: 'Price too low',      sub: 'Offer is below what you\'ll do.' },
  { key: 'distance', label: 'Too far / wrong way', sub: 'Distance or direction doesn\'t work.' },
  { key: 'booked',   label: 'Already booked',     sub: 'You\'re locked in elsewhere.' },
  { key: 'other',    label: 'Something else',     sub: 'Add a note below.' },
];

export default function PassReasonSheet({ open, onClose, onConfirm, submittingLabel = 'Passing…' }: Props) {
  const [reason, setReason] = useState<PassReason | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(reason, message.trim());
    } finally {
      setBusy(false);
      setReason(null);
      setMessage('');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.currentTarget === e.target && !busy) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        fontFamily: "var(--font-body, 'DM Sans', sans-serif)",
        color: '#fff',
      }}
    >
      <div style={{
        background: '#0a0a0a',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '20px 20px',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        maxHeight: '85svh', overflowY: 'auto',
      }}>
        <div style={{
          width: 40, height: 4, background: 'rgba(255,255,255,0.15)',
          borderRadius: 2, margin: '0 auto 14px',
        }} aria-hidden />

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <h3 style={{
            fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)",
            fontSize: 26, margin: 0, letterSpacing: 0.5,
          }}>
            WHY YOU PASSING?
          </h3>
          <p style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
            Helps the rider adjust (they&apos;ll see your reason).
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {REASONS.map((r) => {
            const active = reason === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setReason(r.key)}
                disabled={busy}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 12,
                  background: active ? 'rgba(0,230,118,0.14)' : '#141414',
                  border: `1px solid ${active ? '#00E676' : 'rgba(255,255,255,0.08)'}`,
                  color: '#fff', fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{r.sub}</div>
              </button>
            );
          })}
        </div>

        <label style={{ display: 'block' }}>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            Note to rider (optional)
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
            placeholder="e.g. Can you do $20? I'd run it."
            disabled={busy}
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 12,
              background: '#141414', color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 14, fontFamily: 'inherit', resize: 'none',
            }}
          />
          <div style={{ fontSize: 11, color: '#666', textAlign: 'right', marginTop: 2 }}>
            {message.length}/{MAX_MESSAGE}
          </div>
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1, padding: 14, borderRadius: 100,
              background: 'transparent', color: '#bbb',
              border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              flex: 1, padding: 14, borderRadius: 100,
              background: '#FF6B35', color: '#080808',
              border: 'none', fontSize: 14, fontWeight: 800, cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >
            {busy ? submittingLabel : 'Pass'}
          </button>
        </div>
      </div>
    </div>
  );
}
