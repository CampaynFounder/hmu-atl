'use client';

// Stream C — shared gender preference field for rider + driver profile pages.
// Per docs/BLAST-V3-AGENT-CONTRACT.md §3 D-3: rider/driver picks who they
// prefer to ride/drive with, plus an optional "make this a hard requirement"
// toggle. Soft is the default — strict mode reduces match counts and the UI
// communicates that.
//
// Built standalone; wired into existing profile pages in Phase 8 polish (the
// integration is intentionally deferred so this PR doesn't touch existing
// rider/driver profile UI per non-regression).

import { motion } from 'framer-motion';
import type { GenderPreference, GenderOption } from '@/lib/blast/types';

const OPTIONS: { value: GenderOption; label: string }[] = [
  { value: 'woman', label: 'Women' },
  { value: 'man', label: 'Men' },
  { value: 'nonbinary', label: 'Non-binary' },
];

export interface GenderPreferenceFieldProps {
  value: GenderPreference;
  onChange: (next: GenderPreference) => void;
  userType: 'rider' | 'driver';
  /** Visible above-fold helper copy. Override for marketing variations. */
  helperText?: string;
}

export function GenderPreferenceField({
  value,
  onChange,
  userType,
  helperText,
}: GenderPreferenceFieldProps) {
  const selected = new Set(value.preferred);

  function togglePref(opt: GenderOption) {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange({ ...value, preferred: Array.from(next) });
  }

  function toggleStrict() {
    onChange({ ...value, strict: !value.strict });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={LABEL}>
          {userType === 'rider' ? 'I prefer to ride with' : 'I prefer to drive with'}
        </label>
        <div role="group" aria-label="Gender preference" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {OPTIONS.map((opt) => {
            const active = selected.has(opt.value);
            return (
              <motion.button
                key={opt.value}
                type="button"
                onClick={() => togglePref(opt.value)}
                aria-pressed={active}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{
                  padding: '10px 16px',
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
                }}
              >
                {opt.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          type="checkbox"
          checked={value.strict}
          onChange={toggleStrict}
          style={{ accentColor: '#00E676', width: 18, height: 18, flexShrink: 0 }}
        />
        <span style={{ fontSize: 14, color: '#fff' }}>Make this a hard requirement</span>
      </label>

      <p style={HELP}>
        {helperText ??
          (value.strict
            ? 'Hard preferences reduce match counts. Loosening will surface more rides.'
            : 'Soft preference — drivers matching your pick are prioritized.')}
      </p>
    </div>
  );
}

const LABEL: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.78)',
  letterSpacing: 0.2,
  textTransform: 'uppercase',
};

const HELP: React.CSSProperties = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.55)',
  margin: 0,
  lineHeight: 1.4,
};
