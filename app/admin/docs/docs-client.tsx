'use client';

import { useEffect, useState, useCallback } from 'react';

interface DocStats {
  apiRoutes: number | null;
  authProtected?: number;
  adminOnly?: number;
  publicRoutes?: number;
  categories?: number;
  dbTables: number | null;
  dbColumns: number | null;
  totalLines: number | null;
}

interface GenerateResult {
  status: string;
  generatedAt: string;
  elapsed: string;
  stats: DocStats;
  files: string[];
}

const TABS = [
  { key: 'reference', label: 'Full Reference', desc: 'Combined API + DB schema — everything in one doc' },
  { key: 'api', label: 'API Routes', desc: 'All 140+ API endpoints with methods, auth, request/response' },
  { key: 'schema', label: 'DB Tables', desc: 'Every table and column in the Neon database' },
  { key: 'constraints', label: 'Constraints', desc: 'Primary keys, foreign keys, unique & check constraints' },
  { key: 'indexes', label: 'Indexes', desc: 'All database indexes and their definitions' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

export default function DocsClient() {
  const [stats, setStats] = useState<{ exists: boolean; lastGenerated: string | null; stats: DocStats | null } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Doc viewer
  const [activeTab, setActiveTab] = useState('reference');
  const [docContent, setDocContent] = useState<string | null>(null);
  const [docMeta, setDocMeta] = useState<{ lines: number; sizeBytes: number; lastModified: string } | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/docs/generate');
      if (r.ok) setStats(await r.json());
    } catch { /* ignore */ }
  }, []);

  const fetchDoc = useCallback(async (tab: string) => {
    setLoadingDoc(true);
    setDocContent(null);
    try {
      const r = await fetch('/api/admin/docs/content?doc=' + tab);
      if (r.ok) {
        const data = await r.json();
        setDocContent(data.content);
        setDocMeta({ lines: data.lines, sizeBytes: data.sizeBytes, lastModified: data.lastModified });
      } else {
        const data = await r.json();
        setDocContent(null);
        setToast(data.error || 'Failed to load');
      }
    } catch { setToast('Failed to load doc'); }
    setLoadingDoc(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { if (stats?.exists) fetchDoc(activeTab); }, [activeTab, stats?.exists, fetchDoc]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateResult(null);
    setToast(null);
    try {
      const r = await fetch('/api/admin/docs/generate', { method: 'POST' });
      if (r.ok) {
        const data = await r.json();
        setGenerateResult(data);
        setToast('Docs regenerated in ' + data.elapsed);
        await fetchStats();
        await fetchDoc(activeTab);
      } else {
        const data = await r.json();
        setToast(data.error || 'Generation failed');
      }
    } catch { setToast('Network error'); }
    setGenerating(false);
    setTimeout(() => setToast(null), 5000);
  }

  function handleCopy() {
    if (docContent) {
      navigator.clipboard.writeText(docContent);
      setToast('Copied to clipboard');
      setTimeout(() => setToast(null), 2000);
    }
  }

  function handleDownload() {
    if (!docContent) return;
    const tab = TABS.find(t => t.key === activeTab);
    const filename = tab ? tab.label.toLowerCase().replace(/\s+/g, '-') + '.md' : 'docs.md';
    const blob = new Blob([docContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-neutral-800 border border-neutral-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Technical Documentation</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Auto-generated reference for all API routes and database schema.
            Scans the live codebase and queries Neon directly — always up to date.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-sm font-medium disabled:opacity-50 hover:bg-blue-500/25 transition-colors"
        >
          {generating ? 'Generating...' : 'Regenerate Docs'}
        </button>
      </div>

      {/* Stats cards */}
      {(stats?.stats || generateResult?.stats) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: 'API Routes', value: (generateResult?.stats || stats?.stats)?.apiRoutes },
            { label: 'Auth Protected', value: generateResult?.stats?.authProtected },
            { label: 'Admin Only', value: generateResult?.stats?.adminOnly },
            { label: 'DB Tables', value: (generateResult?.stats || stats?.stats)?.dbTables },
            { label: 'DB Columns', value: (generateResult?.stats || stats?.stats)?.dbColumns },
            { label: 'Doc Lines', value: (generateResult?.stats || stats?.stats)?.totalLines },
          ].filter(s => s.value != null).map(s => (
            <div key={s.label} className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
              <p className="text-[10px] text-neutral-500">{s.label}</p>
              <p className="text-lg font-bold font-mono">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Last generated */}
      {stats?.lastGenerated && (
        <p className="text-[11px] text-neutral-600">
          Last generated: {new Date(stats.lastGenerated).toLocaleString()} ({timeAgo(stats.lastGenerated)})
        </p>
      )}

      {/* Generate result */}
      {generateResult && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3">
          <p className="text-sm text-emerald-400 font-medium">Generated successfully in {generateResult.elapsed}</p>
          <p className="text-xs text-neutral-500 mt-1">
            Files: {generateResult.files.map(f => <code key={f} className="mx-1 text-neutral-400">{f}</code>)}
          </p>
        </div>
      )}

      {/* Doc viewer */}
      {stats?.exists && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-neutral-800 overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-shrink-0 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-400 text-blue-400 bg-neutral-800/50'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab description + actions */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800/50">
            <p className="text-[11px] text-neutral-500">
              {TABS.find(t => t.key === activeTab)?.desc}
              {docMeta && (
                <span className="ml-2 text-neutral-600">
                  {docMeta.lines.toLocaleString()} lines, {formatBytes(docMeta.sizeBytes)}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button onClick={handleCopy} className="text-[11px] text-neutral-500 hover:text-white transition-colors">
                Copy
              </button>
              <button onClick={handleDownload} className="text-[11px] text-neutral-500 hover:text-white transition-colors">
                Download
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[70vh] overflow-auto">
            {loadingDoc ? (
              <div className="p-6 text-neutral-500 text-sm">Loading...</div>
            ) : docContent ? (
              <pre className="p-4 text-[11px] text-neutral-300 leading-relaxed font-mono whitespace-pre-wrap break-words">
                {docContent}
              </pre>
            ) : (
              <div className="p-6 text-neutral-500 text-sm">
                No docs generated yet. Click <strong>Regenerate Docs</strong> to create them.
              </div>
            )}
          </div>
        </div>
      )}

      {/* First time — no docs yet */}
      {stats && !stats.exists && !generating && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
          <p className="text-neutral-400 text-sm">No documentation generated yet.</p>
          <p className="text-neutral-600 text-xs mt-1">
            Click <strong>Regenerate Docs</strong> to scan all API routes and query the live database schema.
          </p>
        </div>
      )}
    </div>
  );
}
