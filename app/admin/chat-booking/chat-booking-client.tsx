'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMarket } from '@/app/admin/components/market-context';
import type { ChatBookingConfig, GenerativeConfig, DeterministicConfig } from '@/lib/chat/config';

type Tab = 'kill_switch' | 'generative' | 'deterministic' | 'test';

interface DriverRow {
  driver_id: string;
  handle: string;
  display_name: string;
  tier: string;
  chill_score: number;
  completed_rides: number;
  override: boolean | null;
  effective: boolean;
}

export function ChatBookingAdmin() {
  const [tab, setTab] = useState<Tab>('kill_switch');
  const [cfg, setCfg] = useState<ChatBookingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/admin/chat-booking');
    if (res.ok) {
      const { config } = await res.json();
      setCfg(config);
    }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const patch = useCallback(async (partial: {
    enabled?: boolean;
    generative?: Partial<GenerativeConfig>;
    deterministic?: Partial<DeterministicConfig>;
  }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/chat-booking', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (res.ok) {
        const { config } = await res.json();
        setCfg(config);
        setFlash('Saved');
        setTimeout(() => setFlash(null), 1500);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <div style={{ padding: 20, color: 'var(--admin-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Chat Booking</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {flash && <span style={{ fontSize: 12, color: '#00E676' }}>{flash}</span>}
          {cfg && (
            <span style={{
              padding: '4px 12px', fontSize: 11, fontWeight: 700, borderRadius: 999,
              background: cfg.enabled ? 'rgba(0,230,118,0.18)' : 'rgba(255,82,82,0.18)',
              color: cfg.enabled ? '#00E676' : '#FF5252',
              letterSpacing: 1, textTransform: 'uppercase' as const,
            }}>
              {cfg.enabled ? 'Globally ON' : 'Globally OFF'}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          ['kill_switch', 'On/Off + Drivers'],
          ['generative', 'Generative'],
          ['deterministic', 'Deterministic'],
          ['test', 'Test playground'],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              borderRadius: 10,
              background: tab === t ? 'var(--admin-bg-active)' : 'transparent',
              color: tab === t ? 'var(--admin-text)' : 'var(--admin-text-secondary)',
              border: '1px solid',
              borderColor: tab === t ? 'var(--admin-border)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--admin-text-muted)', fontSize: 13 }}>Loading…</div>}

      {cfg && tab === 'kill_switch' && (
        <KillSwitchTab cfg={cfg} onGlobalChange={(enabled) => patch({ enabled })} saving={saving} />
      )}
      {cfg && tab === 'generative' && (
        <GenerativeTab cfg={cfg.generative} onChange={(generative) => patch({ generative })} saving={saving} />
      )}
      {cfg && tab === 'deterministic' && (
        <DeterministicTab cfg={cfg.deterministic} onChange={(deterministic) => patch({ deterministic })} saving={saving} />
      )}
      {cfg && tab === 'test' && (
        <TestPlaygroundTab cfg={cfg} />
      )}
    </div>
  );
}

// ─── Tab: On/Off + Drivers ───────────────────────────────────────────
function KillSwitchTab({ cfg, onGlobalChange, saving }: {
  cfg: ChatBookingConfig;
  onGlobalChange: (enabled: boolean) => void;
  saving: boolean;
}) {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [q, setQ] = useState('');
  const [driverLoading, setDriverLoading] = useState(false);
  const { selectedMarketId } = useMarket();

  const loadDrivers = useCallback(async () => {
    setDriverLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (selectedMarketId) params.set('market_id', selectedMarketId);
      const res = await fetch(`/api/admin/chat-booking/drivers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDrivers(data.drivers ?? []);
      }
    } finally {
      setDriverLoading(false);
    }
  }, [q, selectedMarketId]);

  useEffect(() => {
    const h = setTimeout(loadDrivers, 220);
    return () => clearTimeout(h);
  }, [loadDrivers]);

  async function setOverride(driverId: string, value: boolean | null) {
    const res = await fetch(`/api/admin/chat-booking/drivers/${driverId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ override: value }),
    });
    if (res.ok) loadDrivers();
  }

  const overrideCount = Object.keys(cfg.driver_overrides ?? {}).length;
  const forceOnCount = Object.values(cfg.driver_overrides ?? {}).filter((v) => v === true).length;

  return (
    <>
      {/* Global toggle card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Chat booking — global</div>
            <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 2 }}>
              {cfg.enabled
                ? "ON — all drivers show the chat modal unless overridden below."
                : "OFF — all drivers show Sign up / Sign in buttons. Signed-in riders go straight to the booking form."}
            </div>
          </div>
          <Toggle checked={cfg.enabled} onChange={onGlobalChange} disabled={saving} />
        </div>
        {overrideCount > 0 && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--admin-bg)', borderRadius: 8, fontSize: 12, color: 'var(--admin-text-secondary)' }}>
            {forceOnCount} driver{forceOnCount === 1 ? '' : 's'} force-ON, {overrideCount - forceOnCount} force-OFF, regardless of this global switch.
          </div>
        )}
      </div>

      {/* Driver overrides */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--admin-text-muted)', marginBottom: 10 }}>
          Per-driver overrides
        </div>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search driver by handle or name…"
          style={inputStyle}
        />

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {driverLoading && drivers.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', padding: 8 }}>Loading…</div>
          )}
          {!driverLoading && drivers.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', padding: 8 }}>No drivers match.</div>
          )}
          {drivers.map((d) => (
            <div key={d.driver_id} style={{
              display: 'flex', gap: 8, alignItems: 'center',
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--admin-bg)',
              border: `1px solid ${d.override !== null ? '#00E67644' : 'var(--admin-border)'}`,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  @{d.handle}
                  {d.tier === 'hmu_first' && (
                    <span style={{ marginLeft: 8, fontSize: 9, color: '#00E676', fontWeight: 700, letterSpacing: 1 }}>HMU1</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
                  {d.display_name} · {d.completed_rides} rides · {d.chill_score.toFixed(0)}%
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {([
                  [null,  'Inherit',   d.override === null],
                  [true,  'Force ON',  d.override === true],
                  [false, 'Force OFF', d.override === false],
                ] as const).map(([val, label, active]) => (
                  <button
                    key={String(val)}
                    onClick={() => setOverride(d.driver_id, val)}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 600,
                      borderRadius: 6,
                      background: active
                        ? (val === true ? '#00E676' : val === false ? '#FF5252' : 'var(--admin-bg-active)')
                        : 'transparent',
                      color: active
                        ? (val === null ? 'var(--admin-text)' : '#080808')
                        : 'var(--admin-text-secondary)',
                      border: '1px solid var(--admin-border)',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{
                width: 48, textAlign: 'right',
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                color: d.effective ? '#00E676' : '#FF5252',
              }}>
                {d.effective ? 'ON' : 'OFF'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Tab: Generative config ──────────────────────────────────────────
const MODEL_OPTIONS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'] as const;

function GenerativeTab({ cfg, onChange, saving }: {
  cfg: GenerativeConfig;
  onChange: (cfg: Partial<GenerativeConfig>) => void;
  saving: boolean;
}) {
  const [promptDraft, setPromptDraft] = useState(cfg.system_prompt_override ?? '');
  useEffect(() => { setPromptDraft(cfg.system_prompt_override ?? ''); }, [cfg.system_prompt_override]);

  return (
    <>
      <div style={cardStyle}>
        <ToggleRow
          label="Generative layer enabled"
          sub="When off, chat booking falls back to deterministic-only (no LLM — strict form-style stepper). Use this only if you need to kill LLM calls but keep the chat UI up."
          checked={cfg.enabled}
          onChange={(v) => onChange({ enabled: v })}
          disabled={saving}
        />
      </div>

      <div style={cardStyle}>
        <div style={rowStyle}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Model</div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              Swap without redeploy. Keep at gpt-4o-mini for lowest cost.
            </div>
          </div>
          <select
            value={cfg.model}
            onChange={(e) => onChange({ model: e.target.value })}
            disabled={saving}
            style={{ ...inputStyle, width: 180, cursor: 'pointer' }}
          >
            {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            {!MODEL_OPTIONS.includes(cfg.model as (typeof MODEL_OPTIONS)[number]) && (
              <option value={cfg.model}>{cfg.model} (custom)</option>
            )}
          </select>
        </div>

        <div style={{ ...rowStyle, marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Temperature</div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
              0 = deterministic. 0.7 = default chatty. Chat booking prefers low (≤0.4).
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
            <input
              type="range" min={0} max={1.5} step={0.05}
              value={cfg.temperature}
              onChange={(e) => onChange({ temperature: Number(e.target.value) })}
              disabled={saving}
              style={{ flex: 1, accentColor: '#00E676' }}
            />
            <span style={{ fontFamily: 'monospace', fontSize: 13, width: 34, textAlign: 'right' }}>
              {cfg.temperature.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--admin-text-muted)', marginBottom: 10 }}>
          Tools enabled
        </div>
        <div style={{ fontSize: 12, color: 'var(--admin-text-secondary)', marginBottom: 12 }}>
          Disabling a tool strips its definition from the OpenAI call — GPT can&apos;t invoke it.
          Disabling <code style={codeStyle}>confirm_details</code> means chat can never complete a booking;
          useful for forcing a discovery-only mode.
        </div>
        {Object.entries(cfg.tools_enabled).map(([name, enabled]) => (
          <ToggleRow
            key={name}
            label={name}
            sub={TOOL_DESCRIPTIONS[name as keyof typeof TOOL_DESCRIPTIONS] ?? ''}
            checked={enabled}
            onChange={(v) => onChange({ tools_enabled: { ...cfg.tools_enabled, [name]: v } })}
            disabled={saving}
            compact
          />
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--admin-text-muted)', marginBottom: 6 }}>
          System prompt override
        </div>
        <div style={{ fontSize: 12, color: 'var(--admin-text-secondary)', marginBottom: 10 }}>
          Empty = use the code default (recommended). If you set this, it fully replaces the
          baked-in prompt and per-step instructions — you own the entire system turn.
        </div>
        <textarea
          value={promptDraft}
          onChange={(e) => setPromptDraft(e.target.value)}
          placeholder="Leave empty to use the default prompt from lib/chat/booking-prompt.ts"
          style={{ ...inputStyle, minHeight: 180, fontFamily: 'monospace', fontSize: 12 }}
          disabled={saving}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={() => onChange({ system_prompt_override: null })}
            disabled={saving || cfg.system_prompt_override === null}
            style={secondaryBtn}
          >
            Reset to default
          </button>
          <button
            onClick={() => onChange({ system_prompt_override: promptDraft.trim() || null })}
            disabled={saving || promptDraft === (cfg.system_prompt_override ?? '')}
            style={primaryBtn}
          >
            Save prompt
          </button>
        </div>
      </div>
    </>
  );
}

const TOOL_DESCRIPTIONS = {
  extract_booking: 'Pulls structured fields out of the conversation (pickup, dropoff, time, price…).',
  confirm_details: 'Locks the booking. Runs the deterministic gate server-side. OFF = chat is discovery-only.',
  calculate_route: 'Calls Mapbox to get real distance + duration.',
  compare_pricing: 'Compares HMU price vs Uber estimate.',
  analyze_sentiment: 'Flags hostile/safety/spam messages.',
} as const;

// ─── Tab: Deterministic config ───────────────────────────────────────
function DeterministicTab({ cfg, onChange, saving }: {
  cfg: DeterministicConfig;
  onChange: (cfg: Partial<DeterministicConfig>) => void;
  saving: boolean;
}) {
  return (
    <div style={cardStyle}>
      <ToggleRow
        label="Enforce minimum price"
        sub="Reject confirm_details when rider price < driver's minimum. OFF = any price passes the gate."
        checked={cfg.enforce_min_price}
        onChange={(v) => onChange({ enforce_min_price: v })}
        disabled={saving}
      />
      <Separator />
      <ToggleRow
        label="Require payment slot"
        sub="For drivers that accept BOTH cash & card, require isCash in the draft before confirm. Cash-only and digital-only drivers are auto-seeded regardless."
        checked={cfg.require_payment_slot}
        onChange={(v) => onChange({ require_payment_slot: v })}
        disabled={saving}
      />
      <Separator />
      <ToggleRow
        label="Re-resolve time from rider text"
        sub="Never trust the model's ISO string — always re-parse the rider's natural-language time server-side. Recommended ON."
        checked={cfg.re_resolve_time_from_text}
        onChange={(v) => onChange({ re_resolve_time_from_text: v })}
        disabled={saving}
      />
      <Separator />
      <div style={rowStyle}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Driver buffer (minutes)</div>
          <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
            Added before + after each ride when checking availability. Default 10. Range 0–120.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180 }}>
          <input
            type="range" min={0} max={60} step={5}
            value={cfg.buffer_minutes}
            onChange={(e) => onChange({ buffer_minutes: Number(e.target.value) })}
            disabled={saving}
            style={{ flex: 1, accentColor: '#00E676' }}
          />
          <span style={{ fontFamily: 'monospace', fontSize: 13, width: 34, textAlign: 'right' }}>
            {cfg.buffer_minutes}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Test playground ────────────────────────────────────────────
interface TestTurn {
  role: 'user' | 'assistant';
  content: string;
}
interface TestTrace {
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  extracted: Record<string, unknown> | null;
  finalMessage: string | null;
  deterministic: { action: string; reason?: string; payload?: unknown } | null;
  raw?: unknown;
}

function TestPlaygroundTab({ cfg }: { cfg: ChatBookingConfig }) {
  const [driverHandle, setDriverHandle] = useState('');
  const [messages, setMessages] = useState<TestTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [traces, setTraces] = useState<TestTrace[]>([]);
  const [lastExtracted, setLastExtracted] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (!draft.trim() || !driverHandle.trim() || sending) return;
    const userTurn: TestTurn = { role: 'user', content: draft.trim() };
    const nextMessages: TestTurn[] = [...messages, userTurn];
    setMessages(nextMessages);
    setDraft('');
    setSending(true);
    setErr(null);

    try {
      const res = await fetch('/api/admin/chat-booking/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverHandle: driverHandle.trim(), messages: nextMessages, extractedSoFar: lastExtracted }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Request failed');
        return;
      }
      if (data.trace?.finalMessage) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.trace.finalMessage }]);
      }
      if (data.trace?.extracted && typeof data.trace.extracted === 'object') {
        setLastExtracted({ ...(lastExtracted ?? {}), ...data.trace.extracted });
      }
      setTraces((prev) => [data.trace, ...prev].slice(0, 20));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setMessages([]);
    setTraces([]);
    setLastExtracted(null);
    setErr(null);
  }

  return (
    <>
      <div style={{ ...cardStyle, background: 'var(--admin-bg)' }}>
        <div style={{ fontSize: 12, color: 'var(--admin-text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
          Dry-run sandbox — identical pipeline to production but no booking ever gets created.
          Uses the <strong>current saved config</strong> (so tool toggles + prompt override apply here).
          Nothing is persisted.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={driverHandle}
            onChange={(e) => setDriverHandle(e.target.value.replace(/^@/, ''))}
            placeholder="Driver handle (e.g. pharren)"
            style={{ ...inputStyle, flex: 1, minWidth: 180 }}
          />
          <button onClick={reset} style={secondaryBtn}>Reset conversation</button>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', marginBottom: 12 }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', padding: 10 }}>
              Type your first message as the rider. Every turn runs through the same handler as production
              (with current config) and returns tool calls + extracted payload.
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                padding: '8px 12px', borderRadius: 14,
                background: m.role === 'user' ? '#00E676' : 'var(--admin-bg)',
                color: m.role === 'user' ? '#080808' : 'var(--admin-text)',
                fontSize: 13,
                whiteSpace: 'pre-wrap' as const,
              }}
            >
              {m.content}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            placeholder={messages.length === 0 ? 'e.g. "I need a ride from Buckhead to the airport tomorrow at 8am, can you do $30?"' : "Continue the conversation…"}
            style={{ ...inputStyle, flex: 1 }}
            disabled={sending || !driverHandle.trim()}
          />
          <button
            onClick={send}
            disabled={sending || !draft.trim() || !driverHandle.trim()}
            style={primaryBtn}
          >
            {sending ? 'Thinking…' : 'Send'}
          </button>
        </div>
        {err && (
          <div style={{ marginTop: 10, padding: 10, background: 'rgba(255,82,82,0.1)', color: '#FF5252', fontSize: 12, borderRadius: 8 }}>
            {err}
          </div>
        )}
      </div>

      {lastExtracted && Object.keys(lastExtracted).length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--admin-text-muted)', marginBottom: 10 }}>
            Current extracted payload (what the booking form would receive)
          </div>
          <pre style={{
            fontFamily: 'monospace', fontSize: 11,
            background: 'var(--admin-bg)', padding: 12, borderRadius: 8,
            maxHeight: 260, overflow: 'auto',
          }}>
            {JSON.stringify(lastExtracted, null, 2)}
          </pre>
        </div>
      )}

      {traces.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' as const, color: 'var(--admin-text-muted)', marginBottom: 10 }}>
            Tool call trace (newest first)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {traces.map((t, i) => (
              <div key={i} style={{ padding: 10, background: 'var(--admin-bg)', borderRadius: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  {t.toolCalls.length === 0 && (
                    <span style={{ color: 'var(--admin-text-muted)', fontSize: 11 }}>No tools called this turn.</span>
                  )}
                  {t.toolCalls.map((tc, j) => (
                    <span key={j} style={{ padding: '2px 8px', background: 'rgba(0,230,118,0.12)', color: '#00E676', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>
                      {tc.name}
                    </span>
                  ))}
                  {t.deterministic && (
                    <span style={{
                      padding: '2px 8px',
                      background: t.deterministic.action === 'details_confirmed'
                        ? 'rgba(0,230,118,0.12)'
                        : t.deterministic.action === 'incomplete'
                        ? 'rgba(255,179,0,0.15)'
                        : 'rgba(255,82,82,0.15)',
                      color: t.deterministic.action === 'details_confirmed' ? '#00E676'
                        : t.deterministic.action === 'incomplete' ? '#FFB300'
                        : '#FF5252',
                      borderRadius: 4, fontSize: 11, fontWeight: 600,
                    }}>
                      gate: {t.deterministic.action}{t.deterministic.reason ? ` (${t.deterministic.reason})` : ''}
                    </span>
                  )}
                </div>
                {t.toolCalls.length > 0 && (
                  <details>
                    <summary style={{ fontSize: 11, color: 'var(--admin-text-muted)', cursor: 'pointer' }}>
                      Args
                    </summary>
                    <pre style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 10, overflow: 'auto' }}>
                      {JSON.stringify(t.toolCalls.map((tc) => ({ [tc.name]: tc.args })), null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)',
  borderRadius: 12, padding: 16, marginBottom: 14,
};
const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  background: 'var(--admin-bg)', border: '1px solid var(--admin-border)',
  borderRadius: 8, color: 'var(--admin-text)', fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const codeStyle: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: 11, padding: '1px 6px',
  borderRadius: 4, background: 'var(--admin-bg)',
  color: 'var(--admin-text-secondary)', margin: '0 2px',
};
const primaryBtn: React.CSSProperties = {
  padding: '8px 16px', fontSize: 12, fontWeight: 700, borderRadius: 8,
  background: '#00E676', color: '#080808', border: 'none', cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8,
  background: 'transparent', border: '1px solid var(--admin-border)',
  color: 'var(--admin-text-secondary)', cursor: 'pointer',
};

function Separator() {
  return <div style={{ height: 1, background: 'var(--admin-border)', margin: '14px 0' }} />;
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
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
        padding: 0, flexShrink: 0,
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

function ToggleRow({ label, sub, checked, onChange, disabled, compact }: {
  label: string; sub?: string;
  checked: boolean; onChange: (v: boolean) => void;
  disabled?: boolean; compact?: boolean;
}) {
  return (
    <div style={{ ...rowStyle, padding: compact ? '8px 0' : 0 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600, fontFamily: compact ? 'monospace' : 'inherit' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}
