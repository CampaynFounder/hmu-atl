'use client';

import { useEffect, useState, useCallback } from 'react';

interface Lead {
  id: string;
  email: string | null;
  phone: string | null;
  lead_type: 'driver' | 'rider';
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  converted: boolean;
  converted_at: string | null;
  created_at: string;
}

interface Stats {
  driver_count: string;
  rider_count: string;
  converted_count: string;
  last_7d: string;
  last_24h: string;
  total: string;
}

function formatPhone(phone: string | null) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  return phone;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function LeadsPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'driver' | 'rider'>('all');
  const [search, setSearch] = useState('');

  const fetchLeads = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (search.trim()) params.set('q', search.trim());
    fetch(`/api/admin/leads?${params}`)
      .then(r => r.json())
      .then(d => {
        setLeads(d.leads || []);
        setStats(d.stats || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [typeFilter, search]);

  useEffect(() => {
    const t = setTimeout(fetchLeads, 250);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  const exportCsv = () => {
    const header = ['Email', 'Phone', 'Type', 'Source', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Converted', 'Created'];
    const rows = leads.map(l => [
      l.email || '',
      l.phone || '',
      l.lead_type,
      l.source,
      l.utm_source || '',
      l.utm_medium || '',
      l.utm_campaign || '',
      l.converted ? 'yes' : 'no',
      l.created_at,
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lg:pl-64 min-h-screen bg-neutral-950 text-white">
      <div className="p-4 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Leads</h1>
            <p className="text-sm text-neutral-500 mt-1">Captured from landing page forms</p>
          </div>
          <button
            onClick={exportCsv}
            disabled={leads.length === 0}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 text-sm font-semibold"
          >
            Export CSV
          </button>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Drivers" value={stats.driver_count} accent="#00E676" />
            <StatCard label="Riders" value={stats.rider_count} accent="#22D3EE" />
            <StatCard label="Converted" value={stats.converted_count} accent="#A78BFA" />
            <StatCard label="Last 7d" value={stats.last_7d} />
            <StatCard label="Last 24h" value={stats.last_24h} />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex gap-1 bg-neutral-900 rounded-lg p-1">
            {(['all', 'driver', 'rider'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors ${
                  typeFilter === t ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search email, phone, source..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm focus:outline-none focus:border-neutral-700"
          />
        </div>

        {/* Leads table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {loading && leads.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">Loading...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">No leads found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-950/50 text-[10px] uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Email</th>
                    <th className="px-4 py-3 text-left font-semibold">Phone</th>
                    <th className="px-4 py-3 text-left font-semibold">Source</th>
                    <th className="px-4 py-3 text-left font-semibold">Campaign</th>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-t border-neutral-800 hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          lead.lead_type === 'driver' ? 'bg-[#00E676]/15 text-[#00E676]' : 'bg-cyan-400/15 text-cyan-400'
                        }`}>
                          {lead.lead_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-200 font-mono text-xs">{lead.email || '—'}</td>
                      <td className="px-4 py-3 text-neutral-400 font-mono text-xs">{formatPhone(lead.phone)}</td>
                      <td className="px-4 py-3 text-neutral-400 text-xs">{lead.source}</td>
                      <td className="px-4 py-3 text-neutral-500 text-xs">
                        {lead.utm_campaign || lead.utm_source || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {lead.converted ? (
                          <span className="text-[10px] text-[#00E676] font-semibold">✓ Signed up</span>
                        ) : (
                          <span className="text-[10px] text-neutral-600">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">{formatDate(lead.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}
