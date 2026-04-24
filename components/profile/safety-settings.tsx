'use client';

import { useEffect, useState } from 'react';
import type { SafetyPrefs } from '@/lib/db/types';

// Standalone card for in-ride Safety Check-in preferences.
// Drops in anywhere — brings its own card chrome (matches driver/rider profile aesthetics).
export default function SafetySettings() {
  const [prefs, setPrefs] = useState<SafetyPrefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/safety-prefs')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load_failed'))))
      .then((d: SafetyPrefs) => { if (!cancelled) setPrefs(d); })
      .catch(() => { if (!cancelled) setError('Could not load safety settings'); });
    return () => { cancelled = true; };
  }, []);

  async function save(patch: { enabled?: boolean; interval_minutes?: number | null }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/user/safety-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('save_failed');
      const updated = (await res.json()) as SafetyPrefs;
      setPrefs(updated);
      setFlash('Saved');
      setTimeout(() => setFlash(null), 1500);
    } catch {
      setError('Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      padding: 20,
      marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
      }}>
        <div style={{
          fontFamily: "var(--font-mono, 'Space Mono', monospace)",
          fontSize: 10, color: '#888', letterSpacing: 3, textTransform: 'uppercase',
        }}>
          Safety Check-ins
        </div>
        {flash && <span style={{ fontSize: 11, color: '#00E676' }}>{flash}</span>}
      </div>

      <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5, marginBottom: 16 }}>
        During every ride we&apos;ll tap in to ask if you&apos;re good. One tap to dismiss.
        If something&apos;s off, HMU admin gets pinged with your live location.
      </div>

      {/* Toggle row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>In-ride check-ins</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {prefs?.enabled ? "On — we'll tap in during rides" : 'Off — silent rides, anomaly alerts still fire'}
          </div>
        </div>
        <Toggle
          checked={prefs?.enabled ?? true}
          disabled={saving || !prefs}
          onChange={(checked) => prefs && save({ enabled: checked })}
        />
      </div>

      {/* Interval row — only when enabled */}
      {prefs?.enabled && (
        <div style={{
          padding: '14px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>How often</div>
            <div style={{
              fontFamily: "var(--font-mono, 'Space Mono', monospace)",
              fontSize: 14, color: '#00E676', fontWeight: 700,
            }}>
              every {prefs.interval_minutes} min
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {prefs.interval_is_default
              ? 'Default for your profile'
              : 'Custom — tap Reset to use the default'}
          </div>
          <input
            type="range"
            min={prefs.min_interval_minutes}
            max={prefs.max_interval_minutes}
            step={1}
            value={prefs.interval_minutes}
            disabled={saving}
            onChange={(e) => {
              // Local optimistic — we debounce the save via onMouseUp/onTouchEnd.
              setPrefs({ ...prefs, interval_minutes: Number(e.target.value), interval_is_default: false });
            }}
            onMouseUp={(e) => save({ interval_minutes: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => save({ interval_minutes: Number((e.target as HTMLInputElement).value) })}
            style={{
              width: '100%', marginTop: 12, accentColor: '#00E676',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 10, color: '#555' }}>{prefs.min_interval_minutes} min</span>
            <span style={{ fontSize: 10, color: '#555' }}>{prefs.max_interval_minutes} min</span>
          </div>
          {!prefs.interval_is_default && (
            <button
              onClick={() => save({ interval_minutes: null })}
              disabled={saving}
              style={{
                marginTop: 10, background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)', color: '#888',
                fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 100,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              Reset to default
            </button>
          )}
        </div>
      )}

      {error && (
        <div style={{
          fontSize: 12, color: '#FF5252', marginTop: 12,
          padding: '8px 12px', background: 'rgba(255,82,82,0.08)', borderRadius: 10,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Toggle({ checked, disabled, onChange }: {
  checked: boolean; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 50, height: 30, borderRadius: 999, border: 'none',
        background: checked ? '#00E676' : 'rgba(255,255,255,0.12)',
        position: 'relative', cursor: disabled ? 'default' : 'pointer',
        transition: 'background 120ms',
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 23 : 3,
        width: 24, height: 24, borderRadius: '50%', background: '#fff',
        transition: 'left 120ms',
      }} />
    </button>
  );
}
