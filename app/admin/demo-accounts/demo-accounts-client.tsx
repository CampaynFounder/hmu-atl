'use client';

// Demo Accounts admin — provision fully-functional demo accounts with a
// per-account OTP-bypass code (log in without Clerk SMS). Copy / rotate / delete.
// Super-admin only (enforced server-side).

import { useEffect, useState } from 'react';

type Market = { id: string; name: string; slug: string };

interface DemoAccount {
  id: string; phone: string; role: 'driver' | 'rider'; otp_code: string;
  market_slug: string | null; label: string | null; handle: string | null;
  account_status: string | null; created_at: string;
}

const card: React.CSSProperties = { background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 20, marginBottom: 20 };
const inp: React.CSSProperties = { background: '#0e0e0e', border: '1px solid #2a2a2a', borderRadius: 6, padding: '8px 10px', color: '#fff', fontSize: 13, width: '100%' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
const btn = (bg: string, bd: string, c: string): React.CSSProperties => ({ background: bg, border: `1px solid ${bd}`, color: c, borderRadius: 8, padding: '9px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 600 });

export default function DemoAccountsClient({ markets }: { markets: Market[] }) {
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'driver' | 'rider'>('rider');
  const [marketId, setMarketId] = useState(markets[0]?.id ?? '');
  const [labelText, setLabelText] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function flash(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  async function load() {
    const r = await fetch('/api/admin/demo-accounts');
    if (r.ok) setAccounts((await r.json()).accounts ?? []);
  }
  useEffect(() => { load(); }, []);

  async function provision() {
    if (!phone.trim()) { flash('Enter a phone number', false); return; }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/demo-accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, role, marketId: marketId || null, label: labelText || null }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      flash(`Provisioned ${d.account.phone} — code ${d.account.otp_code}`);
      setPhone(''); setLabelText('');
      load();
    } catch (e) { flash(e instanceof Error ? e.message : 'Failed', false); } finally { setSaving(false); }
  }

  async function rotate(id: string) {
    const r = await fetch(`/api/admin/demo-accounts/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'rotate' }),
    });
    if (r.ok) { flash(`New code: ${(await r.json()).otp_code}`); load(); } else flash('Rotate failed', false);
  }
  async function remove(id: string, phone: string) {
    if (!confirm(`Delete demo account ${phone}? This frees the phone and deactivates the account.`)) return;
    const r = await fetch(`/api/admin/demo-accounts/${id}`, { method: 'DELETE' });
    if (r.ok) { flash('Deleted'); load(); } else flash('Delete failed', false);
  }
  function copy(text: string) { navigator.clipboard?.writeText(text).then(() => flash('Copied')).catch(() => {}); }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 24, color: '#fff' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>🎟️ Demo Accounts</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
        Provision fully-functional demo accounts that sign in with a per-account code — no Clerk SMS.
        In the app&apos;s demo login, enter the phone + code below. Rotate or delete a code any time.
      </p>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Provision a demo account</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><span style={label}>Phone (US, unique)</span><input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(404) 555-0142" /></div>
          <div><span style={label}>Role</span>
            <select style={inp} value={role} onChange={(e) => setRole(e.target.value as 'driver' | 'rider')}>
              <option value="rider">rider</option><option value="driver">driver</option>
            </select>
          </div>
          <div><span style={label}>Market</span>
            <select style={inp} value={marketId} onChange={(e) => setMarketId(e.target.value)}>
              <option value="">— none —</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div><span style={label}>Label (optional)</span><input style={inp} value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder="QA driver / reviewer" /></div>
        </div>
        <button style={{ ...btn('#00E676', '#00E676', '#000'), marginTop: 14 }} onClick={provision} disabled={saving}>
          {saving ? 'Provisioning…' : 'Provision + generate code'}
        </button>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Demo accounts ({accounts.length})</h2>
        {accounts.length === 0 ? <p style={{ color: '#666', fontSize: 13 }}>None yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#0e0e0e', borderRadius: 8, opacity: a.account_status === 'deleted' ? 0.5 : 1 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {a.phone} <span style={{ color: '#888', fontWeight: 400 }}>· {a.role}{a.handle ? ` · @${a.handle}` : ''}</span>
                  </div>
                  <div style={{ color: '#666', fontSize: 11 }}>{a.market_slug ?? 'no market'}{a.label ? ` · ${a.label}` : ''}</div>
                </div>
                <button style={{ ...btn('#0b2a17', '#00E676', '#00E676'), fontFamily: 'monospace' }} onClick={() => copy(a.otp_code)} title="Copy code">
                  {a.otp_code} ⧉
                </button>
                <button style={btn('transparent', '#2a2a2a', '#bbb')} onClick={() => rotate(a.id)}>Rotate</button>
                <button style={btn('transparent', '#552', '#c88')} onClick={() => remove(a.id, a.phone)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.ok ? '#0b2a17' : '#2a0b0b', border: `1px solid ${toast.ok ? '#00E676' : '#ff5252'}`, color: toast.ok ? '#00E676' : '#ff8a8a', padding: '12px 18px', borderRadius: 10, fontSize: 13 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
