'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Ticket {
  id: string;
  category: string;
  message: string;
  status: string;
  priority: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  userName: string;
  userHandle: string | null;
  userType: string;
  ride: {
    id: string;
    refCode: string | null;
    status: string;
    price: number;
    pickup: string | null;
    dropoff: string | null;
    driverName: string | null;
    riderName: string | null;
  } | null;
}

const PRIORITY_COLORS: Record<string, { color: string; bg: string }> = {
  urgent: { color: '#FF5252', bg: 'rgba(255,82,82,0.12)' },
  high: { color: '#FF9100', bg: 'rgba(255,145,0,0.12)' },
  normal: { color: '#448AFF', bg: 'rgba(68,138,255,0.12)' },
  low: { color: '#888', bg: 'var(--admin-bg-active)' },
};

const CATEGORY_LABELS: Record<string, string> = {
  payment: 'Payment issue',
  overcharged: 'Overcharged',
  refund: 'Refund request',
  driver_noshow: 'Driver no-show',
  safety: 'Safety concern',
  report_driver: 'Report driver',
  other: 'Other',
};

function timeAgo(d: string): string {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminSupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/support/tickets');
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets ?? []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const selected = tickets.find(t => t.id === selectedId) || null;

  async function updateTicket(ticketId: string, status?: string, adminNotes?: string) {
    setUpdating(true);
    try {
      await fetch('/api/support/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status, adminNotes }),
      });
      await fetchTickets();
    } catch { /* silent */ }
    setUpdating(false);
  }

  const filtered = tickets.filter(t => {
    if (filter === 'open') return t.status === 'open' || t.status === 'in_progress';
    if (filter === 'resolved') return t.status === 'resolved' || t.status === 'closed';
    return true;
  });

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;

  if (loading) {
    return <div className="p-6"><div className="text-neutral-500 text-sm">Loading tickets...</div></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Support Tickets</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {openCount} open ticket{openCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-1">
          {(['open', 'all', 'resolved'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {f === 'open' ? `Open (${openCount})` : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-neutral-500 text-sm">
          {filter === 'open' ? 'No open tickets' : 'No tickets found'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ticket => {
            const pc = PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.normal;
            const isExpanded = selectedId === ticket.id;

            return (
              <div key={ticket.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                {/* Summary */}
                <button
                  type="button"
                  onClick={() => setSelectedId(isExpanded ? null : ticket.id)}
                  className="w-full p-4 text-left flex items-start gap-3"
                >
                  {/* Priority dot */}
                  <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ background: pc.color }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{ticket.userName}</span>
                      {ticket.userHandle && <span className="text-xs text-neutral-500">@{ticket.userHandle}</span>}
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ color: pc.color, background: pc.bg }}>
                        {ticket.priority}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                      {CATEGORY_LABELS[ticket.category] || ticket.category}
                      {ticket.ride?.refCode && (
                        <span className="text-green-400 font-mono ml-2">{ticket.ride.refCode}</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1 truncate">{ticket.message}</div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-neutral-600">{timeAgo(ticket.createdAt)}</div>
                    <div className={`text-[10px] mt-1 font-medium ${
                      ticket.status === 'open' ? 'text-blue-400' :
                      ticket.status === 'in_progress' ? 'text-orange-400' :
                      ticket.status === 'resolved' ? 'text-green-400' : 'text-neutral-500'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-neutral-800">
                    {/* Full message */}
                    <div className="py-3 text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
                      {ticket.message}
                    </div>

                    {/* Ride context */}
                    {ticket.ride && (
                      <div className="bg-neutral-950 rounded-lg p-3 mb-3 text-xs border border-neutral-800">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-white">
                            {ticket.ride.driverName} → {ticket.ride.riderName}
                          </span>
                          <span className="text-green-400 font-mono font-bold">
                            ${ticket.ride.price.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-neutral-500">
                          {ticket.ride.refCode && <span className="text-green-400 font-mono mr-2">{ticket.ride.refCode}</span>}
                          Status: {ticket.ride.status}
                        </div>
                        {ticket.ride.pickup && (
                          <div className="text-neutral-600 mt-1 truncate">A: {ticket.ride.pickup}</div>
                        )}
                        {ticket.ride.dropoff && (
                          <div className="text-neutral-600 truncate">B: {ticket.ride.dropoff}</div>
                        )}
                        <Link href={`/ride/${ticket.ride.id}`} className="text-blue-400 text-[10px] mt-1 inline-block hover:underline">
                          View ride →
                        </Link>
                      </div>
                    )}

                    {/* Admin notes */}
                    {ticket.adminNotes && (
                      <div className="bg-neutral-950 rounded-lg p-3 mb-3 text-xs border border-neutral-800">
                        <div className="text-neutral-500 font-medium mb-1">Admin notes</div>
                        <div className="text-neutral-300 whitespace-pre-wrap">{ticket.adminNotes}</div>
                      </div>
                    )}

                    {/* Admin actions */}
                    <div className="space-y-2">
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Add internal notes..."
                        rows={2}
                        className="w-full p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white placeholder-neutral-600 resize-none outline-none focus:border-neutral-600"
                      />
                      <div className="flex gap-2 flex-wrap">
                        {ticket.status === 'open' && (
                          <button
                            onClick={() => { updateTicket(ticket.id, 'in_progress', notes || undefined); setNotes(''); }}
                            disabled={updating}
                            className="px-4 py-2 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-medium disabled:opacity-50"
                          >
                            Start Working
                          </button>
                        )}
                        {(ticket.status === 'open' || ticket.status === 'in_progress') && (
                          <button
                            onClick={() => { updateTicket(ticket.id, 'resolved', notes || undefined); setNotes(''); }}
                            disabled={updating}
                            className="px-4 py-2 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-medium disabled:opacity-50"
                          >
                            Resolve
                          </button>
                        )}
                        {notes.trim() && (
                          <button
                            onClick={() => { updateTicket(ticket.id, undefined, notes); setNotes(''); }}
                            disabled={updating}
                            className="px-4 py-2 rounded-full bg-white/5 border border-neutral-700 text-neutral-300 text-xs font-medium disabled:opacity-50"
                          >
                            Save Notes
                          </button>
                        )}
                        {ticket.status === 'resolved' && (
                          <button
                            onClick={() => updateTicket(ticket.id, 'open')}
                            disabled={updating}
                            className="px-4 py-2 rounded-full bg-white/5 border border-neutral-700 text-neutral-400 text-xs font-medium disabled:opacity-50"
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
