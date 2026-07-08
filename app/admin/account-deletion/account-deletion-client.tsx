'use client';

import { useEffect, useState } from 'react';

export default function AccountDeletionClient() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/account-deletion')
      .then((r) => r.json())
      .then((d) => setEnabled(d?.config?.enabled ?? true))
      .catch(() => setError('Could not load current setting'))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(next: boolean) {
    if (next === enabled || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/account-deletion', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'Failed to save');
      setEnabled(d.config.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24, color: '#fff', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Account Deletion</h1>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
        Whether riders and drivers can delete their own account from the mobile app.
        Takes effect on the next app load — no rebuild. <b style={{ color: '#bbb' }}>On</b> by
        default; leave it on unless you specifically need to pull the feature.
      </p>

      {error && (
        <div style={{ background: '#3a1414', border: '1px solid #FF5252', color: '#FF5252', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#888' }}>Loading…</p>
      ) : (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12, padding: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Allow account deletion
            </div>
            <div style={{ fontSize: 13, color: '#aaa' }}>
              {enabled
                ? 'Users can delete their account. The "Delete account" option is visible in the app.'
                : 'Deletion is turned off. The option is hidden in the app and the delete endpoint rejects requests.'}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={!!enabled}
            onClick={() => toggle(!enabled)}
            disabled={saving}
            style={{
              flexShrink: 0, width: 58, height: 32, borderRadius: 999, border: 'none',
              cursor: saving ? 'default' : 'pointer', position: 'relative',
              background: enabled ? '#00E676' : '#3a3a3c', transition: 'background 0.15s',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <span
              style={{
                position: 'absolute', top: 3, left: enabled ? 29 : 3,
                width: 26, height: 26, borderRadius: '50%', background: '#fff',
                transition: 'left 0.15s',
              }}
            />
          </button>
        </div>
      )}

      <p style={{ color: '#666', fontSize: 12, marginTop: 24 }}>
        Current: <b style={{ color: enabled ? '#00E676' : '#FF5252' }}>{enabled == null ? '—' : enabled ? 'ON' : 'OFF'}</b>
        {saving && <span style={{ color: '#888' }}> · saving…</span>}
      </p>
    </div>
  );
}
