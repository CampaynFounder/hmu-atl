'use client';

import { useEffect, useState, useCallback } from 'react';

interface MarketStatus {
  slug: string;
  envKey: string;
  didConfigured: boolean;
  didTail: string | null;
  registeredUrl: string | null;
}

interface ConfigData {
  credentials: { usernameConfigured: boolean; passwordConfigured: boolean };
  markets: MarketStatus[];
  settings: { webhookSecret: string; ipAllowlist: string };
}

interface TestResult { ok: boolean; balance?: string; error?: string }
interface RegisterResult { ok: boolean; callbackUrl: string; did: string; market: string; type: string; apiError?: string; manualSetupUrl: string }

const MARKET_LABELS: Record<string, string> = { atl: 'Atlanta', nola: 'New Orleans', hou: 'Houston', dal: 'Dallas', mem: 'Memphis' };

function StatusDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#00E676' : '#555', flexShrink: 0 }} />
      <span style={{ color: on ? '#00E676' : '#888', fontSize: 13 }}>{label}</span>
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      style={{ background: copied ? '#1a3a1a' : '#1a1a2e', border: '1px solid #333', borderRadius: 4, color: copied ? '#00E676' : '#aaa', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export function VoipConfigClient() {
  const [data, setData]           = useState<ConfigData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting]     = useState(false);
  const [secret, setSecret]       = useState('');
  const [allowlist, setAllowlist] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');
  const [regResults, setRegResults] = useState<Record<string, RegisterResult>>({});
  const [regLoading, setRegLoading] = useState<Record<string, boolean>>({});

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://atl.hmucashride.com';

  const inboundUrl   = (s: string) => `${baseUrl}/api/webhooks/voipms${s ? `?secret=${encodeURIComponent(s)}` : ''}`;
  const deliveryUrl  = (s: string) => `${baseUrl}/api/blast/voipms/webhook${s ? `?secret=${encodeURIComponent(s)}` : ''}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/voip-config');
      const json = await res.json() as ConfigData;
      setData(json);
      setSecret(json.settings.webhookSecret);
      setAllowlist(json.settings.ipAllowlist);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/voip-config/test-connection', { method: 'POST' });
      setTestResult(await res.json() as TestResult);
    } finally {
      setTesting(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/admin/voip-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_secret: secret, ip_allowlist: allowlist }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      setSaveMsg(json.ok ? 'Saved' : (json.error ?? 'Error'));
      if (json.ok) load();
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const registerWebhook = async (market: string, type: 'inbound' | 'delivery') => {
    const key = `${market}-${type}`;
    setRegLoading(p => ({ ...p, [key]: true }));
    try {
      const res = await fetch('/api/admin/voip-config/register-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market, type }),
      });
      const json = await res.json() as RegisterResult;
      setRegResults(p => ({ ...p, [key]: json }));
      if (json.ok) load();
    } finally {
      setRegLoading(p => ({ ...p, [key]: false }));
    }
  };

  if (loading) return <div style={{ color: '#888', padding: 32 }}>Loading…</div>;
  if (!data)   return <div style={{ color: '#f44', padding: 32 }}>Failed to load</div>;

  const credOk = data.credentials.usernameConfigured && data.credentials.passwordConfigured;

  return (
    <div style={{ padding: 24, maxWidth: 900, fontFamily: 'system-ui, sans-serif', color: '#e0e0e0' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>VoIP.ms Configuration</h1>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 28 }}>
        Credentials are Cloudflare Worker secrets (read-only here). Webhook security and DID registration are managed below.
      </p>

      {/* ── Credentials Status ── */}
      <section style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Credentials</h2>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 16 }}>
          <StatusDot on={data.credentials.usernameConfigured} label="API Username" />
          <StatusDot on={data.credentials.passwordConfigured} label="API Password" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={testConnection}
            disabled={testing || !credOk}
            style={{ background: '#1a1a2e', border: '1px solid #444', borderRadius: 6, color: credOk ? '#fff' : '#555', cursor: credOk ? 'pointer' : 'not-allowed', fontSize: 13, padding: '7px 16px' }}
          >
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          {testResult && (
            <span style={{ fontSize: 13, color: testResult.ok ? '#00E676' : '#f44' }}>
              {testResult.ok ? `Connected — balance: $${testResult.balance ?? '?'}` : testResult.error}
            </span>
          )}
        </div>
      </section>

      {/* ── Per-Market DID Status ── */}
      <section style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>DID Numbers (per market)</h2>
        <p style={{ color: '#666', fontSize: 12, marginBottom: 14 }}>Set via Cloudflare Worker secrets (e.g. VOIPMS_DID_ATL). Each DID needs both callback URLs registered.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#666', borderBottom: '1px solid #222' }}>
                {['Market', 'Env Key', 'DID', 'Registered URL', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px 10px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.markets.map(m => {
                const inKey = `${m.slug}-inbound`;
                const dlKey = `${m.slug}-delivery`;
                return (
                  <tr key={m.slug} style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{MARKET_LABELS[m.slug] ?? m.slug.toUpperCase()}</td>
                    <td style={{ padding: '10px 12px', color: '#666', fontFamily: 'monospace', fontSize: 12 }}>{m.envKey}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {m.didConfigured
                        ? <span style={{ color: '#00E676' }}>···{m.didTail}</span>
                        : <span style={{ color: '#555' }}>Not set</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, maxWidth: 260 }}>
                      {m.registeredUrl
                        ? <span style={{ color: '#aaa', wordBreak: 'break-all' }}>{m.registeredUrl.slice(0, 60)}{m.registeredUrl.length > 60 ? '…' : ''}</span>
                        : <span style={{ color: '#555' }}>None detected</span>}
                      {regResults[inKey] && (
                        <div style={{ marginTop: 4, color: regResults[inKey].ok ? '#00E676' : '#f44', fontSize: 11 }}>
                          {regResults[inKey].ok ? 'Inbound registered ✓' : `Inbound: ${regResults[inKey].apiError}`}
                        </div>
                      )}
                      {regResults[dlKey] && (
                        <div style={{ marginTop: 2, color: regResults[dlKey].ok ? '#00E676' : '#f44', fontSize: 11 }}>
                          {regResults[dlKey].ok ? 'Delivery registered ✓' : `Delivery: ${regResults[dlKey].apiError}`}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {m.didConfigured ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => registerWebhook(m.slug, 'inbound')}
                            disabled={regLoading[inKey]}
                            style={{ background: '#1a1a2e', border: '1px solid #444', borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 11, padding: '4px 10px' }}
                          >
                            {regLoading[inKey] ? '…' : 'Register Inbound'}
                          </button>
                          <button
                            onClick={() => registerWebhook(m.slug, 'delivery')}
                            disabled={regLoading[dlKey]}
                            style={{ background: '#1a1a2e', border: '1px solid #444', borderRadius: 4, color: '#aaa', cursor: 'pointer', fontSize: 11, padding: '4px 10px' }}
                          >
                            {regLoading[dlKey] ? '…' : 'Register Delivery'}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#444', fontSize: 12 }}>No DID</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Callback URLs ── */}
      <section style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Callback URLs</h2>
        <p style={{ color: '#666', fontSize: 12, marginBottom: 14 }}>
          Paste these into the VoIP.ms portal under <strong style={{ color: '#888' }}>DID Numbers → Manage DID → SMS → URL Callback</strong>.{' '}
          <a href="https://voip.ms/m/didsmanage.php" target="_blank" rel="noreferrer" style={{ color: '#7c6ff0' }}>Open VoIP.ms portal ↗</a>
        </p>
        {[
          { label: 'Inbound SMS (new messages from riders/drivers)', url: inboundUrl(secret) },
          { label: 'Delivery receipts (blast SMS delivery status)', url: deliveryUrl(secret) },
        ].map(({ label, url }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 4, color: '#7c6ff0', fontSize: 12, padding: '5px 10px', flex: 1, wordBreak: 'break-all' }}>
                {url}
              </code>
              <CopyButton text={url} />
            </div>
          </div>
        ))}
      </section>

      {/* ── Webhook Security ── */}
      <section style={{ background: '#111', border: '1px solid #222', borderRadius: 8, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Webhook Security</h2>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: '#888', fontSize: 12, marginBottom: 6 }}>
            Webhook Secret
            <span style={{ color: '#555', marginLeft: 8 }}>appended as ?secret=... to all callback URLs — validate in inbound + delivery webhook routes</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              placeholder="e.g. hmu_wh_abc123"
              style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 6, color: '#e0e0e0', fontSize: 13, padding: '8px 12px', width: 320 }}
            />
            <CopyButton text={secret} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: '#888', fontSize: 12, marginBottom: 6 }}>
            IP Allowlist
            <span style={{ color: '#555', marginLeft: 8 }}>comma-separated — leave blank to allow all, enter * to explicitly allow all</span>
          </label>
          <textarea
            value={allowlist}
            onChange={e => setAllowlist(e.target.value)}
            placeholder="e.g. 208.167.234.1, 208.167.234.2"
            rows={3}
            style={{ background: '#0a0a0a', border: '1px solid #333', borderRadius: 6, color: '#e0e0e0', fontFamily: 'monospace', fontSize: 12, padding: '8px 12px', resize: 'vertical', width: '100%' }}
          />
          <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>VoIP.ms published IPs: 208.167.234.0/24 and 66.175.220.0/24 (verify in VoIP.ms docs)</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={saveSettings}
            disabled={saving}
            style={{ background: '#7c6ff0', border: 'none', borderRadius: 6, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, padding: '9px 20px' }}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          {saveMsg && <span style={{ color: saveMsg === 'Saved' ? '#00E676' : '#f44', fontSize: 13 }}>{saveMsg}</span>}
        </div>
      </section>

      {/* ── Manual Setup Note ── */}
      <section style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 8, padding: 16 }}>
        <p style={{ color: '#555', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: '#666' }}>Manual setup:</strong> If "Register" buttons fail (VoIP.ms API may not support programmatic callback updates for all account types),
          copy the callback URLs above and paste them into{' '}
          <a href="https://voip.ms/m/didsmanage.php" target="_blank" rel="noreferrer" style={{ color: '#7c6ff0' }}>VoIP.ms → DID Numbers → select DID → SMS tab → URL Callback field</a>.
          Set the same secret in the URL and in the Webhook Secret field above.
        </p>
      </section>
    </div>
  );
}
