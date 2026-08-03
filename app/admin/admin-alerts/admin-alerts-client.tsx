'use client';

// Super-admin push alerts config — toggle the ride-request ping and the daily
// 7am summary, and send a test summary. No-code toggles, default on.

import { useEffect, useState } from 'react';

const card: React.CSSProperties = { background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 20, marginBottom: 16 };
const btn = (bg: string, bd: string, c: string): React.CSSProperties => ({ background: bg, border: `1px solid ${bd}`, color: c, borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600 });

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{ width: 52, height: 30, borderRadius: 15, border: 'none', cursor: 'pointer', background: on ? '#00E676' : '#3a3a3c', position: 'relative', transition: 'background .15s' }}
      aria-pressed={on}
    >
      <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 24, height: 24, borderRadius: 12, background: '#fff', transition: 'left .15s' }} />
    </button>
  );
}

export default function AdminAlertsClient() {
  const [rideRequests, setRideRequests] = useState(true);
  const [dailySummary, setDailySummary] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [testing, setTesting] = useState(false);

  function flash(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/admin-alerts');
      if (r.ok) { const c = await r.json(); setRideRequests(c.rideRequests); setDailySummary(c.dailySummary); }
      setLoaded(true);
    })();
  }, []);

  async function save(next: { rideRequests: boolean; dailySummary: boolean }) {
    const r = await fetch('/api/admin/admin-alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    if (r.ok) flash('Saved'); else flash('Save failed', false);
  }
  function setRide(v: boolean) { setRideRequests(v); save({ rideRequests: v, dailySummary }); }
  function setDaily(v: boolean) { setDailySummary(v); save({ rideRequests, dailySummary: v }); }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await fetch('/api/admin/admin-alerts', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      flash(`Test sent to ${d.recipients} admin${d.recipients === 1 ? '' : 's'} — ${d.requested} req / ${d.completed} done`);
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed', false); } finally { setTesting(false); }
  }

  if (!loaded) return <div style={{ padding: 24, color: '#888' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, color: '#fff' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>🔔 Admin Push Alerts</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Push notifications to super-admins with the app installed and notifications allowed.
      </p>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>New ride request</div>
          <div style={{ color: '#888', fontSize: 12 }}>Push on every ride requested on the platform (direct, blast, Down Bad, open request). Turn off if it gets noisy.</div>
        </div>
        <Toggle on={rideRequests} onChange={setRide} />
      </div>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Daily summary — 7am ET</div>
          <div style={{ color: '#888', fontSize: 12 }}>Once a day: rides requested, completed, GMV, revenue (platform fees), and profit (fees − Stripe cost) for the last 24h.</div>
        </div>
        <Toggle on={dailySummary} onChange={setDaily} />
      </div>

      <button style={btn('transparent', '#2a2a2a', '#bbb')} onClick={sendTest} disabled={testing}>
        {testing ? 'Sending…' : 'Send test summary now'}
      </button>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.ok ? '#0b2a17' : '#2a0b0b', border: `1px solid ${toast.ok ? '#00E676' : '#ff5252'}`, color: toast.ok ? '#00E676' : '#ff8a8a', padding: '12px 18px', borderRadius: 10, fontSize: 13 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
