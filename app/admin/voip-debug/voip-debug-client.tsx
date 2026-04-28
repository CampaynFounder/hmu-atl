'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMarket } from '@/app/admin/components/market-context';

interface InboundHit {
  id: string;
  method: string;
  source: string;
  outcome: 'stored' | 'ping' | 'missing_fields' | 'parse_failed';
  rawQuery: string | null;
  rawBody: string | null;
  contentType: string | null;
  parsedParams: Record<string, string> | null;
  fromPhone: string | null;
  toDid: string | null;
  voipmsId: string | null;
  error: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface OutboundHit {
  id: string;
  toPhone: string;
  fromDid: string;
  message: string;
  status: 'sent' | 'failed' | 'skipped';
  voipmsStatus: string | null;
  voipmsHttpStatus: number | null;
  voipmsResponse: Record<string, unknown> | null;
  error: string | null;
  retryCount: number | null;
  eventType: string | null;
  createdAt: string;
}

interface Counts {
  stored: number;
  ping: number;
  missingFields: number;
  parseFailed: number;
  total: number;
}

type Tab = 'inbound' | 'outbound';
type OutcomeFilter = 'all' | 'stored' | 'ping' | 'missing_fields' | 'parse_failed';

export function VoipDebugClient() {
  const [tab, setTab] = useState<Tab>('inbound');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [inbound, setInbound] = useState<InboundHit[]>([]);
  const [outbound, setOutbound] = useState<OutboundHit[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { selectedMarketId } = useMarket();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qp = new URLSearchParams();
      if (outcomeFilter !== 'all') qp.set('outcome', outcomeFilter);
      if (phoneFilter.trim()) qp.set('phone', phoneFilter.trim());
      if (selectedMarketId) qp.set('marketId', selectedMarketId);
      const res = await fetch(`/api/admin/voip-debug?${qp.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInbound(data.inbound ?? []);
        setOutbound(data.outbound ?? []);
        setCounts(data.counts24h ?? null);
      }
    } catch {}
    setLoading(false);
  }, [outcomeFilter, phoneFilter, selectedMarketId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 15s while on the page
  useEffect(() => {
    const t = setInterval(fetchData, 15_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
    });

  const outcomeColor = (o: InboundHit['outcome']) => {
    switch (o) {
      case 'stored': return '#00E676';
      case 'ping': return '#888';
      case 'missing_fields': return '#FFB300';
      case 'parse_failed': return '#FF5252';
    }
  };

  const statusColor = (s: OutboundHit['status']) => {
    switch (s) {
      case 'sent': return '#00E676';
      case 'failed': return '#FF5252';
      case 'skipped': return '#FFB300';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">VoIP Debug</h1>
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-xs text-neutral-400 hover:text-white border border-neutral-800 rounded-full px-3 py-1.5 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Last 24h counts */}
      {counts && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {([
            { key: 'stored', label: 'Stored', val: counts.stored, color: '#00E676' },
            { key: 'ping', label: 'Pings', val: counts.ping, color: '#888' },
            { key: 'missing_fields', label: 'Missing Fields', val: counts.missingFields, color: '#FFB300' },
            { key: 'parse_failed', label: 'Parse Failed', val: counts.parseFailed, color: '#FF5252' },
            { key: 'total', label: 'Total 24h', val: counts.total, color: 'var(--admin-text)' },
          ] as const).map(({ key, label, val, color }) => (
            <div key={key} style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontFamily: "'Space Mono', monospace" }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-neutral-800">
        {(['inbound', 'outbound'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === t ? 'border-[#00E676] text-white' : 'border-transparent text-neutral-500 hover:text-white'
            }`}
          >
            {t === 'inbound' ? 'Inbound (voip → us)' : 'Outbound (us → voip)'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {tab === 'inbound' && (
          <div className="flex items-center gap-1">
            {(['all', 'stored', 'ping', 'missing_fields', 'parse_failed'] as const).map(o => (
              <button
                key={o}
                onClick={() => setOutcomeFilter(o)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  outcomeFilter === o
                    ? 'border-[#00E676] text-[#00E676] bg-[#00E676]/10'
                    : 'border-neutral-800 text-neutral-500 hover:text-white'
                }`}
              >
                {o.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}
        <input
          type="search"
          inputMode="tel"
          value={phoneFilter}
          onChange={(e) => setPhoneFilter(e.target.value)}
          placeholder="Phone (last digits)…"
          className="bg-neutral-950 border border-neutral-800 rounded-full px-3 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600"
        />
      </div>

      {/* Inbound list */}
      {tab === 'inbound' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {loading && inbound.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">Loading…</div>
          ) : inbound.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">No webhook hits yet.</div>
          ) : (
            <div className="divide-y divide-neutral-800/50">
              {inbound.map(hit => (
                <div key={hit.id} className="px-4 py-3">
                  <button
                    onClick={() => toggle(hit.id)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ color: outcomeColor(hit.outcome), background: outcomeColor(hit.outcome) + '20' }}
                      >
                        {hit.outcome.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-neutral-600 font-mono">{hit.method}/{hit.source}</span>
                      {hit.fromPhone && (
                        <span className="text-xs text-neutral-300 font-mono truncate">{hit.fromPhone}</span>
                      )}
                      {hit.error && (
                        <span className="text-[10px] text-red-400 truncate">⚠ {hit.error}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-neutral-600 shrink-0">{formatTime(hit.createdAt)}</span>
                  </button>
                  {expanded[hit.id] && (
                    <div className="mt-2 space-y-2 text-[11px] font-mono">
                      <DebugBlock label="parsed params" value={hit.parsedParams} />
                      <DebugBlock label="raw query" value={hit.rawQuery || '(none)'} />
                      <DebugBlock label="raw body" value={hit.rawBody || '(none)'} />
                      <DebugBlock label="content-type" value={hit.contentType || '(none)'} />
                      <DebugBlock label="user-agent" value={hit.userAgent || '(none)'} />
                      <DebugBlock label="ids" value={{ to_did: hit.toDid, voipms_id: hit.voipmsId }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Outbound list */}
      {tab === 'outbound' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {loading && outbound.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">Loading…</div>
          ) : outbound.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">No outbound sends yet.</div>
          ) : (
            <div className="divide-y divide-neutral-800/50">
              {outbound.map(hit => (
                <div key={hit.id} className="px-4 py-3">
                  <button
                    onClick={() => toggle(hit.id)}
                    className="w-full flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ color: statusColor(hit.status), background: statusColor(hit.status) + '20' }}
                      >
                        {hit.status}
                      </span>
                      {hit.voipmsHttpStatus !== null && (
                        <span className="text-[10px] text-neutral-500 font-mono">HTTP {hit.voipmsHttpStatus}</span>
                      )}
                      {hit.voipmsStatus && hit.voipmsStatus !== 'success' && (
                        <span className="text-[10px] text-red-400 font-mono">{hit.voipmsStatus}</span>
                      )}
                      <span className="text-xs text-neutral-300 font-mono shrink-0">{hit.toPhone}</span>
                      <span className="text-xs text-neutral-500 truncate">{hit.message}</span>
                    </div>
                    <span className="text-[10px] text-neutral-600 shrink-0">{formatTime(hit.createdAt)}</span>
                  </button>
                  {expanded[hit.id] && (
                    <div className="mt-2 space-y-2 text-[11px] font-mono">
                      <DebugBlock label="voipms response" value={hit.voipmsResponse} />
                      <DebugBlock label="meta" value={{
                        from_did: hit.fromDid,
                        event_type: hit.eventType,
                        retry_count: hit.retryCount,
                        error: hit.error,
                        http_status: hit.voipmsHttpStatus,
                      }} />
                      <DebugBlock label="full message" value={hit.message} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DebugBlock({ label, value }: { label: string; value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-neutral-600 mb-1">{label}</div>
      <pre className="bg-black/40 border border-neutral-800 rounded p-2 text-neutral-300 whitespace-pre-wrap break-words text-[11px] leading-relaxed">
        {text || '(empty)'}
      </pre>
    </div>
  );
}
