'use client';

import { useEffect, useState } from 'react';

type Mode = 'browser' | 'embedded' | 'native';

const OPTIONS: { mode: Mode; title: string; blurb: string; tag: string; tagColor: string }[] = [
  {
    mode: 'browser',
    title: 'In-app Safari sheet',
    tag: 'RELIABLE',
    tagColor: '#00E676',
    blurb: 'Opens Stripe hosted onboarding in an ASWebAuthenticationSession — an in-app system sheet (not a full browser switch). Works on all devices because it shares Safari cookies. Recommended default.',
  },
  {
    mode: 'embedded',
    title: 'Embedded ConnectJS (WebView)',
    tag: 'FLAKY ON iOS',
    tagColor: '#FFB020',
    blurb: 'Stripe embedded onboarding themed inside an in-app WebView. Fully branded, but iOS WKWebView blocks the cross-origin cookies/storage ConnectJS needs → "error authenticating your account". Keep for testing only.',
  },
  {
    mode: 'native',
    title: 'Native forms (Custom accounts)',
    tag: 'NEW DRIVERS ONLY',
    tagColor: '#7C9CFF',
    blurb: 'Fully native KYC + bank forms — no WebView. Best UX. Only applies to drivers with no Stripe account yet (existing accounts fall back to the Safari sheet), and needs Stripe Custom-account approval before payouts actually enable.',
  },
];

export default function PayoutModeClient() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [saving, setSaving] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/payout-mode')
      .then((r) => r.json())
      .then((d) => setMode(d?.config?.mode ?? 'browser'))
      .catch(() => setError('Could not load current mode'))
      .finally(() => setLoading(false));
  }, []);

  async function select(next: Mode) {
    if (next === mode || saving) return;
    setSaving(next);
    setError(null);
    try {
      const res = await fetch('/api/admin/payout-mode', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'Failed to save');
      setMode(d.config.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, color: '#fff', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Driver Payout Mode</h1>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
        How drivers set up payouts in the mobile app. Changes take effect on the next
        app load — no rebuild. Test each option on-device to see what works best.
      </p>

      {error && (
        <div style={{ background: '#3a1414', border: '1px solid #FF5252', color: '#FF5252', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#888' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {OPTIONS.map((o) => {
            const active = mode === o.mode;
            return (
              <button
                key={o.mode}
                onClick={() => select(o.mode)}
                disabled={!!saving}
                style={{
                  textAlign: 'left',
                  background: active ? 'rgba(0,230,118,0.08)' : '#141414',
                  border: `1px solid ${active ? '#00E676' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 12,
                  padding: 16,
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving && saving !== o.mode ? 0.5 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${active ? '#00E676' : '#555'}`, background: active ? '#00E676' : 'transparent', flexShrink: 0 }} />
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{o.title}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1, color: o.tagColor, border: `1px solid ${o.tagColor}`, borderRadius: 999, padding: '2px 8px' }}>{o.tag}</span>
                  {saving === o.mode && <span style={{ color: '#888', fontSize: 12 }}>saving…</span>}
                </div>
                <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.5, margin: 0, paddingLeft: 26 }}>{o.blurb}</p>
              </button>
            );
          })}
        </div>
      )}

      <p style={{ color: '#666', fontSize: 12, marginTop: 24 }}>
        Current mode: <b style={{ color: '#00E676' }}>{mode ?? '—'}</b>
      </p>
    </div>
  );
}
