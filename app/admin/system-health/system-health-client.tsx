'use client';

import { useEffect, useState, useCallback } from 'react';

type RunStatus = 'running' | 'pass' | 'fail';

interface CheckResult {
  name: string;
  pass: boolean;
  duration_ms: number;
  error?: string;
}

interface SmokeRun {
  id: string;
  env: string;
  market: string;
  triggered_by: string;
  status: RunStatus;
  results: CheckResult[] | null;
  passed_count: number;
  failed_count: number;
  total_count: number;
  duration_ms: number | null;
  commit_sha: string | null;
  created_at: string;
  completed_at: string | null;
}

const MARKETS = ['atl', 'nola', 'hou', 'dal', 'mem'] as const;
const ENVS    = ['staging', 'production'] as const;

const STATUS_COLORS: Record<RunStatus, string> = {
  running: 'text-amber-400',
  pass:    'text-green-400',
  fail:    'text-red-400',
};

const STATUS_BG: Record<RunStatus, string> = {
  running: 'bg-amber-500/10 border-amber-500/20',
  pass:    'bg-green-500/10 border-green-500/20',
  fail:    'bg-red-500/10  border-red-500/20',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function sha(s: string | null) {
  return s ? s.slice(0, 7) : null;
}

export default function SystemHealthClient() {
  const [env, setEnv]         = useState<'staging' | 'production'>('staging');
  const [market, setMarket]   = useState<string>('');
  const [runs, setRuns]       = useState<SmokeRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Trigger state
  const [trigEnv, setTrigEnv]       = useState<'staging' | 'production'>('staging');
  const [trigMarket, setTrigMarket] = useState('atl');
  const [triggering, setTriggering] = useState(false);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ env });
      if (market) params.set('market', market);
      const res = await fetch(`/api/admin/smoke-runs?${params}`);
      if (res.ok) {
        const data = await res.json() as { runs: SmokeRun[] };
        setRuns(data.runs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [env, market]);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  const trigger = useCallback(async () => {
    setTriggering(true);
    setToast(null);
    try {
      const res = await fetch('/api/admin/trigger-smoke-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env: trigEnv, market: trigMarket }),
      });
      if (res.ok) {
        setToast({ msg: `Smoke run queued — ${trigEnv}/${trigMarket}. Results appear below in ~30s.`, ok: true });
        setTimeout(() => fetchRuns(), 35000);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setToast({ msg: body.error ?? 'Dispatch failed', ok: false });
      }
    } catch {
      setToast({ msg: 'Network error', ok: false });
    } finally {
      setTriggering(false);
      setTimeout(() => setToast(null), 6000);
    }
  }, [trigEnv, trigMarket, fetchRuns]);

  const lastRun = runs[0];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">System Health</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Automated smoke tests run after every staging deploy. Failures trigger a VoIP.ms SMS alert.
        </p>
      </div>

      {/* Latest status banner */}
      {lastRun && (
        <div className={`border rounded-xl px-4 py-3 flex items-center justify-between ${STATUS_BG[lastRun.status]}`}>
          <div className="flex items-center gap-3">
            <span className={`text-lg font-bold ${STATUS_COLORS[lastRun.status]}`}>
              {lastRun.status === 'running' ? '⏳' : lastRun.status === 'pass' ? '✓' : '✗'}
            </span>
            <div>
              <div className={`text-sm font-semibold ${STATUS_COLORS[lastRun.status]}`}>
                {lastRun.status === 'running' ? 'Running…' : lastRun.status === 'pass' ? 'All checks passed' : `${lastRun.failed_count} check${lastRun.failed_count !== 1 ? 's' : ''} failed`}
              </div>
              <div className="text-[11px] text-neutral-500">
                {lastRun.env}/{lastRun.market} · {fmt(lastRun.created_at)}
                {lastRun.commit_sha && <> · <code className="text-neutral-400">{sha(lastRun.commit_sha)}</code></>}
              </div>
            </div>
          </div>
          {lastRun.total_count > 0 && (
            <div className="text-right">
              <div className="text-sm font-mono font-bold" style={{ color: 'var(--admin-text)' }}>
                {lastRun.passed_count}/{lastRun.total_count}
              </div>
              {lastRun.duration_ms && (
                <div className="text-[11px] text-neutral-500">{lastRun.duration_ms}ms</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`border rounded-lg px-4 py-2 text-sm ${toast.ok ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {toast.msg}
        </div>
      )}

      {/* Trigger panel */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div className="text-sm font-semibold mb-3" style={{ color: 'var(--admin-text)' }}>Run Tests Now</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] text-neutral-500 mb-1 block">Environment</label>
            <select
              value={trigEnv}
              onChange={(e) => setTrigEnv(e.target.value as typeof trigEnv)}
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm"
              style={{ color: 'var(--admin-text)' }}
            >
              {ENVS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-neutral-500 mb-1 block">Market</label>
            <select
              value={trigMarket}
              onChange={(e) => setTrigMarket(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm"
              style={{ color: 'var(--admin-text)' }}
            >
              {MARKETS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </div>
          <button
            onClick={trigger}
            disabled={triggering}
            className="bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-neutral-600 text-white text-sm font-medium px-5 py-1.5 rounded-lg transition-colors"
          >
            {triggering ? 'Queuing…' : 'Run Tests'}
          </button>
          <button
            onClick={fetchRuns}
            className="text-xs text-neutral-500 hover:text-neutral-300 px-3 py-1.5 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-neutral-800">
          {ENVS.map((e) => (
            <button
              key={e}
              onClick={() => setEnv(e)}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${env === e ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              {e}
            </button>
          ))}
        </div>
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs"
          style={{ color: 'var(--admin-text)' }}
        >
          <option value="">All markets</option>
          {MARKETS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
        </select>
      </div>

      {/* Run history */}
      {loading ? (
        <div className="text-neutral-500 text-sm">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="text-neutral-500 text-sm">No runs yet for {env}{market ? `/${market}` : ''}.</div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              {/* Run row */}
              <button
                type="button"
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold w-4 ${STATUS_COLORS[run.status]}`}>
                    {run.status === 'running' ? '⏳' : run.status === 'pass' ? '✓' : '✗'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--admin-text)' }}>
                        {run.env}/{run.market}
                      </span>
                      {run.commit_sha && (
                        <code className="text-[11px] text-neutral-500">{sha(run.commit_sha)}</code>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {run.triggered_by} · {fmt(run.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {run.total_count > 0 && (
                    <span className={`text-sm font-mono ${run.failed_count > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {run.passed_count}/{run.total_count}
                    </span>
                  )}
                  {run.duration_ms && (
                    <span className="text-[11px] text-neutral-600">{run.duration_ms}ms</span>
                  )}
                  <span className="text-neutral-600 text-xs">{expanded === run.id ? '▲' : '▼'}</span>
                </div>
              </button>

              {/* Check breakdown */}
              {expanded === run.id && run.results && run.results.length > 0 && (
                <div className="border-t border-neutral-800 px-4 py-3 space-y-1.5">
                  {run.results.map((check) => (
                    <div key={check.name} className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className={`text-xs font-bold mt-0.5 ${check.pass ? 'text-green-400' : 'text-red-400'}`}>
                          {check.pass ? '✓' : '✗'}
                        </span>
                        <div>
                          <span className="text-xs font-mono" style={{ color: 'var(--admin-text)' }}>{check.name}</span>
                          {check.error && (
                            <div className="text-[11px] text-red-400 mt-0.5">{check.error}</div>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-neutral-600 shrink-0">{check.duration_ms}ms</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
