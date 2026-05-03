'use client';

import { useEffect, useState, useCallback } from 'react';

type InquiryStatus = 'new' | 'contacted' | 'scoped' | 'won' | 'lost' | 'closed';

interface Inquiry {
  id: string;
  market_slug: string;
  name: string;
  role: string;
  email: string;
  phone: string | null;
  social_handle: string | null;
  event_name: string;
  event_date: string | null;
  expected_attendance: string | null;
  notes: string | null;
  status: InquiryStatus;
  contacted_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Stats {
  new_count: string;
  contacted_count: string;
  won_count: string;
  last_7d: string;
  last_24h: string;
  total: string;
}

const STATUS_OPTIONS: InquiryStatus[] = ['new', 'contacted', 'scoped', 'won', 'lost', 'closed'];

const STATUS_COLORS: Record<InquiryStatus, string> = {
  new: '#00E676',
  contacted: '#FFB300',
  scoped: '#A78BFA',
  won: '#22D3EE',
  lost: '#FF4444',
  closed: '#666',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatEventDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPhone(phone: string | null) {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

// If the social string is a URL (or looks like a domain) return an https URL,
// else null. Bare @handles render as text — admin can copy/paste from there.
function socialUrl(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z0-9._-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return `https://${v}`;
  return null;
}

export function EventsPanel() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | InquiryStatus>('all');
  const [marketFilter, setMarketFilter] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchInquiries = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (marketFilter !== 'all') params.set('market', marketFilter);
    if (search.trim()) params.set('q', search.trim());
    fetch(`/api/admin/events?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setInquiries(d.inquiries || []);
        setStats(d.stats || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter, marketFilter, search]);

  useEffect(() => {
    const t = setTimeout(fetchInquiries, 250);
    return () => clearTimeout(t);
  }, [fetchInquiries]);

  async function updateStatus(id: string, status: InquiryStatus) {
    setInquiries((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await fetch(`/api/admin/events/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error('Status update failed:', err);
      fetchInquiries();
    }
  }

  function exportCsv() {
    const header = ['Created', 'Market', 'Name', 'Role', 'Email', 'Phone', 'Social', 'Event', 'Date', 'Attendance', 'Status', 'Notes'];
    const rows = inquiries.map((i) => [
      i.created_at,
      i.market_slug,
      i.name,
      i.role,
      i.email,
      i.phone || '',
      i.social_handle || '',
      i.event_name,
      i.event_date || '',
      i.expected_attendance || '',
      i.status,
      (i.notes || '').replace(/\n/g, ' '),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-inquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const markets = Array.from(new Set(inquiries.map((i) => i.market_slug))).sort();

  return (
    <div className="lg:pl-64 min-h-screen bg-neutral-950 text-white">
      <div className="p-4 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Event Inquiries</h1>
            <p className="text-sm text-neutral-500 mt-1">Captured from /events partner landing page</p>
          </div>
          <button
            onClick={exportCsv}
            disabled={inquiries.length === 0}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 text-sm font-semibold"
          >
            Export CSV
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
            <StatCard label="Total" value={stats.total} />
            <StatCard label="New" value={stats.new_count} accent="#00E676" />
            <StatCard label="Contacted" value={stats.contacted_count} accent="#FFB300" />
            <StatCard label="Won" value={stats.won_count} accent="#22D3EE" />
            <StatCard label="Last 7d" value={stats.last_7d} />
            <StatCard label="Last 24h" value={stats.last_24h} />
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-4 flex-wrap">
          <div className="flex gap-1 bg-neutral-900 rounded-lg p-1">
            {(['all', ...STATUS_OPTIONS] as const).map((t) => (
              <button
                key={t}
                onClick={() => setStatusFilter(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors ${
                  statusFilter === t ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {markets.length > 1 && (
            <div className="flex gap-1 bg-neutral-900 rounded-lg p-1">
              {(['all', ...markets] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMarketFilter(m)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wide transition-colors ${
                    marketFilter === m ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            placeholder="Search name, email, event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-sm focus:outline-none focus:border-neutral-700"
          />
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          {loading && inquiries.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">Loading...</div>
          ) : inquiries.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-sm">No inquiries found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-950/50 text-[10px] uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold">Event</th>
                    <th className="px-4 py-3 text-left font-semibold">Contact</th>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Size</th>
                    <th className="px-4 py-3 text-left font-semibold">Market</th>
                    <th className="px-4 py-3 text-left font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {inquiries.map((inq) => (
                    <tr
                      key={inq.id}
                      onClick={() => setExpanded(expanded === inq.id ? null : inq.id)}
                      className="border-t border-neutral-800 hover:bg-white/[0.02] cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <select
                          value={inq.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateStatus(inq.id, e.target.value as InquiryStatus)}
                          className="bg-transparent border border-neutral-700 rounded px-2 py-1 text-[11px] uppercase font-bold tracking-wide focus:outline-none focus:border-neutral-500"
                          style={{ color: STATUS_COLORS[inq.status] }}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s} style={{ color: '#fff', background: '#0a0a0a' }}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-neutral-200 font-semibold">{inq.event_name}</div>
                        {expanded === inq.id && inq.notes && (
                          <div className="mt-2 text-xs text-neutral-400 max-w-md whitespace-pre-wrap">{inq.notes}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-neutral-200">{inq.name}</div>
                        <div className="text-xs text-neutral-500">{inq.role}</div>
                        <a href={`mailto:${inq.email}`} onClick={(e) => e.stopPropagation()} className="text-xs text-cyan-400 hover:underline font-mono block mt-1">
                          {inq.email}
                        </a>
                        {inq.phone && (
                          <div className="text-xs text-neutral-500 font-mono">{formatPhone(inq.phone)}</div>
                        )}
                        {inq.social_handle && (
                          (() => {
                            const url = socialUrl(inq.social_handle);
                            return url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-[#A78BFA] hover:underline font-mono block"
                              >
                                {inq.social_handle}
                              </a>
                            ) : (
                              <div className="text-xs text-[#A78BFA] font-mono">{inq.social_handle}</div>
                            );
                          })()
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-300 text-xs whitespace-nowrap">{formatEventDate(inq.event_date)}</td>
                      <td className="px-4 py-3 text-neutral-400 text-xs whitespace-nowrap">{inq.expected_attendance || '—'}</td>
                      <td className="px-4 py-3 text-neutral-400 text-xs uppercase tracking-wider">{inq.market_slug}</td>
                      <td className="px-4 py-3 text-neutral-500 text-xs whitespace-nowrap">{formatDate(inq.created_at)}</td>
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
