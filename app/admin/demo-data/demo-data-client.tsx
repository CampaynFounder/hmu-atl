'use client';

import { useEffect, useState } from 'react';

type Tier = 'hmu_first' | 'free';
interface Month { month: string; cash: number; hmuPay: number; delivery: number; rides: number }
interface DriverCfg { enabled: boolean; walletAvailable: number; walletPending: number; tier: Tier; months: Month[] }
interface Ride { date: string; driverName: string; driverHandle: string; pickup: string; dropoff: string; amount: number; rating: string }
interface RiderCfg { enabled: boolean; rides: Ride[] }

const card: React.CSSProperties = { background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 20, marginBottom: 20 };
const inp: React.CSSProperties = { background: '#0e0e0e', border: '1px solid #2a2a2a', borderRadius: 6, padding: '6px 8px', color: '#fff', fontSize: 13, width: '100%' };
const btn = (bg: string, bd: string, c: string): React.CSSProperties => ({ background: bg, border: `1px solid ${bd}`, color: c, borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' });
const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: '#888', fontWeight: 600, padding: '4px 6px' };
const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export default function DemoDataClient() {
  const [driver, setDriver] = useState<DriverCfg | null>(null);
  const [rider, setRider] = useState<RiderCfg | null>(null);
  const [demoConfigured, setDemoConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/demo-data')
      .then((r) => r.json())
      .then((d) => { setDriver(d.driver); setRider(d.rider); setDemoConfigured(d.demoConfigured); })
      .catch(() => setMsg('Could not load'))
      .finally(() => setLoading(false));
  }, []);

  async function save(section: 'driver' | 'rider', config: unknown) {
    setSaving(section); setMsg(null);
    try {
      const res = await fetch('/api/admin/demo-data', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, config }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error ?? 'Failed');
      setDriver(d.driver); setRider(d.rider);
      setMsg(`${section === 'driver' ? 'Driver' : 'Rider'} demo data saved ✓`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(null); }
  }

  if (loading) return <div style={{ padding: 24, color: '#888' }}>Loading…</div>;
  if (!driver || !rider) return <div style={{ padding: 24, color: '#FF5252' }}>Could not load demo config.</div>;

  const setD = (patch: Partial<DriverCfg>) => setDriver({ ...driver, ...patch });
  const setMonth = (i: number, patch: Partial<Month>) =>
    setD({ months: driver.months.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setR = (patch: Partial<RiderCfg>) => setRider({ ...rider, ...patch });
  const setRide = (i: number, patch: Partial<Ride>) =>
    setR({ rides: rider.rides.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, color: '#fff', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Demo Account Data</h1>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
        Fake numbers shown ONLY on the App Store reviewer demo accounts (driver +1&nbsp;404&nbsp;696&nbsp;5907,
        rider +1&nbsp;404&nbsp;696&nbsp;5908). Takes effect on the next app load — no rebuild. Real users are unaffected.
      </p>

      {!demoConfigured && (
        <div style={{ background: '#3a2a14', border: '1px solid #FFB020', color: '#FFB020', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
          Heads up: <code>DEMO_LOGIN_PHONE</code> isn’t set on this environment, so no account is currently treated as a demo
          account and these overrides won’t apply until it is.
        </div>
      )}
      {msg && (
        <div style={{ background: '#14261a', border: '1px solid #00E676', color: '#00E676', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>{msg}</div>
      )}

      {/* ── DRIVER ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Driver — wallet & earnings graph</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={driver.enabled} onChange={(e) => setD({ enabled: e.target.checked })} />
            Show demo data
          </label>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#aaa' }}>
            Wallet balance $ (= cash out)
            <input style={{ ...inp, width: 160 }} type="number" value={driver.walletAvailable}
              onChange={(e) => setD({ walletAvailable: num(e.target.value) })} />
          </label>
          <label style={{ fontSize: 12, color: '#aaa' }}>
            Pending $
            <input style={{ ...inp, width: 140 }} type="number" value={driver.walletPending}
              onChange={(e) => setD({ walletPending: num(e.target.value) })} />
          </label>
          <label style={{ fontSize: 12, color: '#aaa' }}>
            Tier
            <select style={{ ...inp, width: 140 }} value={driver.tier} onChange={(e) => setD({ tier: e.target.value as Tier })}>
              <option value="hmu_first">HMU First</option>
              <option value="free">Free</option>
            </select>
          </label>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={th}>Month (YYYY-MM)</th>
              <th style={th}>Cash $</th>
              <th style={th}>HMU Pay $</th>
              <th style={th}>Delivery $</th>
              <th style={th}># Rides</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {driver.months.map((m, i) => (
              <tr key={i}>
                <td style={{ padding: 4 }}><input style={inp} value={m.month} placeholder="2026-06" onChange={(e) => setMonth(i, { month: e.target.value })} /></td>
                <td style={{ padding: 4 }}><input style={inp} type="number" value={m.cash} onChange={(e) => setMonth(i, { cash: num(e.target.value) })} /></td>
                <td style={{ padding: 4 }}><input style={inp} type="number" value={m.hmuPay} onChange={(e) => setMonth(i, { hmuPay: num(e.target.value) })} /></td>
                <td style={{ padding: 4 }}><input style={inp} type="number" value={m.delivery} onChange={(e) => setMonth(i, { delivery: num(e.target.value) })} /></td>
                <td style={{ padding: 4 }}><input style={inp} type="number" value={m.rides} onChange={(e) => setMonth(i, { rides: Math.round(num(e.target.value)) })} /></td>
                <td style={{ padding: 4 }}>
                  <button onClick={() => setD({ months: driver.months.filter((_, j) => j !== i) })} style={btn('transparent', '#552', '#c88')}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setD({ months: [...driver.months, { month: '', cash: 0, hmuPay: 0, delivery: 0, rides: 0 }] })} style={btn('#1a1a1a', '#333', '#ddd')}>+ Add month</button>
          <button onClick={() => save('driver', driver)} disabled={saving === 'driver'} style={btn('rgba(0,230,118,0.15)', '#00E676', '#00E676')}>
            {saving === 'driver' ? 'Saving…' : 'Save driver data'}
          </button>
        </div>
      </div>

      {/* ── RIDER ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Rider — ride history</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={rider.enabled} onChange={(e) => setR({ enabled: e.target.checked })} />
            Show demo data
          </label>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={th}>Date (YYYY-MM-DD)</th>
              <th style={th}>Driver name</th>
              <th style={th}>Pickup</th>
              <th style={th}>Dropoff</th>
              <th style={th}>$</th>
              <th style={th}>Rating</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rider.rides.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: 4 }}><input style={inp} value={r.date} placeholder="2026-06-15" onChange={(e) => setRide(i, { date: e.target.value })} /></td>
                <td style={{ padding: 4 }}><input style={inp} value={r.driverName} onChange={(e) => setRide(i, { driverName: e.target.value })} /></td>
                <td style={{ padding: 4 }}><input style={inp} value={r.pickup} onChange={(e) => setRide(i, { pickup: e.target.value })} /></td>
                <td style={{ padding: 4 }}><input style={inp} value={r.dropoff} onChange={(e) => setRide(i, { dropoff: e.target.value })} /></td>
                <td style={{ padding: 4 }}><input style={inp} type="number" value={r.amount} onChange={(e) => setRide(i, { amount: num(e.target.value) })} /></td>
                <td style={{ padding: 4 }}>
                  <select style={inp} value={r.rating} onChange={(e) => setRide(i, { rating: e.target.value })}>
                    <option value="">—</option>
                    <option value="chill">chill</option>
                    <option value="cool_af">cool_af</option>
                    <option value="kinda_creepy">kinda_creepy</option>
                    <option value="weirdo">weirdo</option>
                  </select>
                </td>
                <td style={{ padding: 4 }}>
                  <button onClick={() => setR({ rides: rider.rides.filter((_, j) => j !== i) })} style={btn('transparent', '#552', '#c88')}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setR({ rides: [...rider.rides, { date: '', driverName: '', driverHandle: '', pickup: '', dropoff: '', amount: 0, rating: '' }] })} style={btn('#1a1a1a', '#333', '#ddd')}>+ Add ride</button>
          <button onClick={() => save('rider', rider)} disabled={saving === 'rider'} style={btn('rgba(0,230,118,0.15)', '#00E676', '#00E676')}>
            {saving === 'rider' ? 'Saving…' : 'Save rider data'}
          </button>
        </div>
      </div>
    </div>
  );
}
