'use client';

import { useState } from 'react';

interface ColdStartConfig {
  keep_warm: boolean;
  suspend_timeout_seconds: number;
}

const ONE_HOUR = 3_600;
const ALWAYS = 604_800;

function describe(cfg: ColdStartConfig): string {
  if (!cfg.keep_warm) return 'Autosuspends after 5 min idle — first request after idle is slow (cold start).';
  if (cfg.suspend_timeout_seconds === ONE_HOUR) return 'Stays warm through traffic gaps, suspends after 1 hour idle.';
  return 'Always warm — never suspends. Zero cold starts, highest idle compute cost.';
}

export default function ColdStartClient({
  initialConfig,
  initialAppliedSeconds,
  neonConfigured,
}: {
  initialConfig: ColdStartConfig;
  initialAppliedSeconds: number;
  neonConfigured: boolean;
}) {
  const [saved, setSaved] = useState<ColdStartConfig>(initialConfig);
  const [appliedSeconds, setAppliedSeconds] = useState(initialAppliedSeconds);
  const [draft, setDraft] = useState<ColdStartConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'warn' | 'err' } | null>(null);

  const dirty =
    draft.keep_warm !== saved.keep_warm ||
    draft.suspend_timeout_seconds !== saved.suspend_timeout_seconds;

  function showToast(msg: string, kind: 'ok' | 'warn' | 'err') {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 6000);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cold-start', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Save failed', 'err');
        return;
      }
      setSaved(data.config);
      setDraft(data.config);
      setAppliedSeconds(data.appliedSeconds);
      if (data.neon?.ok) {
        showToast('Saved and applied to the production database.', 'ok');
      } else {
        showToast(
          `Saved, but NOT applied to Neon: ${data.neon?.error || 'unknown error'}`,
          'warn',
        );
      }
    } catch {
      showToast('Network error', 'err');
    } finally {
      setSaving(false);
    }
  }

  const card: React.CSSProperties = {
    background: 'var(--admin-bg-elevated)',
    border: '1px solid var(--admin-border)',
    borderRadius: 12,
    padding: 20,
    maxWidth: 640,
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 4 }}>
        Cold-Start Prevention
      </h1>
      <p style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginBottom: 20, maxWidth: 640 }}>
        Controls whether the production database compute is kept warm. Keeping it warm removes the
        slow first request after idle, at the cost of always-on compute. (The query retry layer is
        independent and always on — this only changes cost vs. latency.)
      </p>

      {!neonConfigured && (
        <div
          style={{
            ...card,
            borderColor: 'var(--admin-danger, #FF5252)',
            marginBottom: 16,
            color: 'var(--admin-text)',
            fontSize: 13,
          }}
        >
          ⚠️ <strong>NEON_API_KEY is not set on this worker.</strong> You can save the setting, but it
          won&apos;t apply to the live database until the secret is added
          (<code>wrangler secret put NEON_API_KEY</code>).
        </div>
      )}

      <div style={card}>
        {/* Keep-warm toggle */}
        <label
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: 'pointer', marginBottom: draft.keep_warm ? 20 : 0,
          }}
        >
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--admin-text)' }}>
              Keep database warm {draft.keep_warm ? 'ON' : 'OFF'}
            </p>
            <p style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 2 }}>
              {describe(draft)}
            </p>
          </div>
          <span
            onClick={() => setDraft((d) => ({ ...d, keep_warm: !d.keep_warm }))}
            style={{
              width: 46, height: 26, borderRadius: 999, position: 'relative', flexShrink: 0,
              transition: 'background 150ms',
              background: draft.keep_warm ? 'var(--admin-success, #00E676)' : 'rgba(255,255,255,0.12)',
            }}
          >
            <span
              style={{
                position: 'absolute', top: 2, left: draft.keep_warm ? 22 : 2,
                width: 22, height: 22, borderRadius: '50%', background: '#fff',
                transition: 'left 150ms',
              }}
            />
          </span>
        </label>

        {/* Warm-window presets — only relevant when keep-warm is ON */}
        {draft.keep_warm && (
          <div>
            <p style={{ fontSize: 11, letterSpacing: 1, color: 'var(--admin-text-faint)', marginBottom: 8 }}>
              WARM WINDOW
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: '1 HOUR', value: ONE_HOUR },
                { label: 'ALWAYS', value: ALWAYS },
              ].map((opt) => {
                const active = draft.suspend_timeout_seconds === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setDraft((d) => ({ ...d, suspend_timeout_seconds: opt.value }))}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      fontWeight: 700, fontSize: 13,
                      border: `1px solid ${active ? 'var(--admin-success, #00E676)' : 'var(--admin-border)'}`,
                      background: active ? 'rgba(0,230,118,0.12)' : 'var(--admin-bg)',
                      color: active ? 'var(--admin-success, #00E676)' : 'var(--admin-text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Current applied state */}
      <p style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 14 }}>
        Currently applied to prod compute: <strong>{appliedSeconds === 300 ? '5 min (default)' : appliedSeconds === ONE_HOUR ? '1 hour' : '7 days (always warm)'}</strong>
        {' '}({appliedSeconds}s suspend timeout)
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14,
            border: 'none', cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            background: dirty && !saving ? 'var(--admin-success, #00E676)' : 'var(--admin-border)',
            color: dirty && !saving ? '#000' : 'var(--admin-text-muted)',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {toast && (
          <span
            style={{
              fontSize: 13,
              color:
                toast.kind === 'ok' ? 'var(--admin-success, #00E676)'
                  : toast.kind === 'warn' ? 'var(--admin-warning, #FFB300)'
                  : 'var(--admin-danger, #FF5252)',
            }}
          >
            {toast.msg}
          </span>
        )}
      </div>
    </div>
  );
}
