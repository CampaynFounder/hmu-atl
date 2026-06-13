'use client';

import { useCallback, useEffect, useState } from 'react';

const ALL_SCOPES = ['drivers:read', 'quotes:read', 'bookings:write', 'blasts:write'] as const;

interface KeyRow {
  id: string;
  mode: 'test' | 'live';
  prefix: string;
  revoked: boolean;
  lastUsed: string | null;
}
interface Partner {
  id: string;
  name: string;
  payer_mode: 'vendor_funded' | 'pass_through';
  markup_bps: number;
  market_ids: string[];
  scopes: string[];
  status: 'active' | 'suspended';
  rate_limit_per_min: number;
  webhook_url: string | null;
  has_vendor_customer: boolean;
  keys: KeyRow[];
}

export default function PartnerKeysClient() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [minted, setMinted] = useState<{ api_key: string; signing_secret: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/partner-keys');
      const data = await res.json();
      setPartners(Array.isArray(data.partners) ? data.partners : []);
    } catch {
      setMsg('Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/partner-keys', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return res.json();
  };
  const patch = async (payload: Record<string, unknown>) => {
    await fetch('/api/admin/partner-keys', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    await load();
  };

  const createPartner = async () => {
    if (!newName.trim()) return;
    await post({ action: 'create_partner', name: newName.trim(), payer_mode: 'vendor_funded', scopes: ['drivers:read', 'quotes:read'] });
    setNewName('');
    await load();
  };

  const mintKey = async (partnerId: string, mode: 'test' | 'live') => {
    const r = await post({ action: 'mint_key', partner_id: partnerId, mode });
    if (r.api_key) { setMinted({ api_key: r.api_key, signing_secret: r.signing_secret }); await load(); }
  };

  const revokeKey = async (keyId: string) => {
    await post({ action: 'revoke_key', key_id: keyId });
    await load();
  };

  const toggleScope = (p: Partner, scope: string) => {
    const next = p.scopes.includes(scope) ? p.scopes.filter((s) => s !== scope) : [...p.scopes, scope];
    void patch({ partner_id: p.id, scopes: next });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 text-white">
      <div>
        <h1 className="text-lg font-semibold">Partner API Keys</h1>
        <p className="text-[12px] text-neutral-500 mt-1">
          Provision third-party vendors: create a partner, mint keys, set scopes, payer mode, webhook, and the live Stripe customer.
        </p>
      </div>

      {/* minted-key reveal */}
      {minted && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 space-y-2">
          <div className="text-amber-300 text-sm font-semibold">Save these now — shown once</div>
          <Field label="API key" value={minted.api_key} />
          <Field label="Signing secret" value={minted.signing_secret} />
          <button onClick={() => setMinted(null)} className="text-[12px] text-neutral-300 underline">Done</button>
        </div>
      )}

      {/* create partner */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New partner name"
          className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
        />
        <button onClick={createPartner} className="rounded-lg bg-white text-black text-sm font-semibold px-4 hover:bg-neutral-200">
          Create
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : (
        partners.map((p) => (
          <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{p.name}</div>
              <button
                onClick={() => patch({ partner_id: p.id, status: p.status === 'active' ? 'suspended' : 'active' })}
                className={`text-[11px] px-2 py-1 rounded ${p.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
              >
                {p.status}
              </button>
            </div>

            {/* scopes */}
            <div className="flex flex-wrap gap-1.5">
              {ALL_SCOPES.map((s) => (
                <button key={s} onClick={() => toggleScope(p, s)}
                  className={`text-[11px] px-2 py-1 rounded ${p.scopes.includes(s) ? 'bg-white text-black' : 'bg-neutral-800 text-neutral-400'}`}>
                  {s}
                </button>
              ))}
            </div>

            {/* payer + config */}
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <label className="space-y-1">
                <span className="text-neutral-500">Payer mode</span>
                <select value={p.payer_mode} onChange={(e) => patch({ partner_id: p.id, payer_mode: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1">
                  <option value="vendor_funded">vendor_funded</option>
                  <option value="pass_through">pass_through</option>
                </select>
              </label>
              <BlurField label={`Vendor Stripe customer ${p.has_vendor_customer ? '✓' : ''}`} placeholder="cus_…"
                onSave={(v) => patch({ partner_id: p.id, vendor_stripe_customer_id: v })} />
              <BlurField label="Webhook URL" placeholder="https://…" defaultValue={p.webhook_url ?? ''}
                onSave={(v) => patch({ partner_id: p.id, webhook_url: v })} />
              <div className="text-neutral-600 self-end">{p.rate_limit_per_min}/min</div>
            </div>

            {/* keys */}
            <div className="space-y-1">
              {p.keys.length === 0 && <div className="text-[12px] text-neutral-600">No keys yet.</div>}
              {p.keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between text-[12px]">
                  <span className={k.revoked ? 'text-neutral-600 line-through' : 'text-neutral-300'}>
                    {k.prefix}… <span className="text-neutral-600">({k.mode})</span>
                  </span>
                  {!k.revoked && (
                    <button onClick={() => revokeKey(k.id)} className="text-red-400 text-[11px]">revoke</button>
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={() => mintKey(p.id, 'test')} className="text-[11px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">+ test key</button>
                <button onClick={() => mintKey(p.id, 'live')} className="text-[11px] px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">+ live key</button>
              </div>
            </div>
          </div>
        ))
      )}
      {msg && <div className="text-[12px] text-neutral-400 text-center">{msg}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-500">{label}</div>
      <code className="block bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[12px] break-all select-all">{value}</code>
    </div>
  );
}

function BlurField({ label, placeholder, defaultValue = '', onSave }: { label: string; placeholder?: string; defaultValue?: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(defaultValue);
  return (
    <label className="space-y-1">
      <span className="text-neutral-500">{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== defaultValue && onSave(v)} placeholder={placeholder}
        className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1" />
    </label>
  );
}
