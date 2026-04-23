'use client';

import { useEffect, useState, useCallback } from 'react';
import { useMarket } from '@/app/admin/components/market-context';

interface HmuRow {
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  linked_at: string | null;
  dismissed_at: string | null;
  driver_id: string;
  rider_id: string;
  market_id: string | null;
  driver_handle: string | null;
  driver_name: string | null;
  rider_handle: string | null;
}

interface TopSender {
  driver_id: string;
  sends: number;
  driver_handle: string | null;
  driver_name: string | null;
}

export default function HmusAuditClient() {
  const { selectedMarketId, selectedMarket } = useMarket();
  const [rows, setRows] = useState<HmuRow[]>([]);
  const [topSenders, setTopSenders] = useState<TopSender[]>([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedMarketId) params.set('marketId', selectedMarketId);
      const res = await fetch(`/api/admin/hmus?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.recent ?? []);
        setTopSenders(data.topSenders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMarketId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRevoke = useCallback(async (id: string) => {
    if (!confirm('Revoke this HMU and block the driver from re-sending? This cannot be undone.')) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/admin/hmus/${id}/revoke`, { method: 'POST' });
      if (res.ok) {
        setToast('Revoked');
        fetchData();
      } else {
        setToast('Failed to revoke');
      }
    } catch {
      setToast('Network error');
    } finally {
      setRevoking(null);
      window.setTimeout(() => setToast(null), 2500);
    }
  }, [fetchData]);

  const statusStyle: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400',
    linked: 'bg-blue-500/20 text-blue-400',
    dismissed: 'bg-neutral-600/20 text-neutral-400',
    expired: 'bg-yellow-500/20 text-yellow-400',
    unlinked: 'bg-neutral-600/20 text-neutral-400',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">HMUs</h1>
        <p className="text-xs text-neutral-500 mt-1">
          Recent directed HMUs
          {selectedMarket && <> in <span className="text-neutral-300">{selectedMarket.name}</span></>}.
          Revoke closes the HMU and blocks the driver from resending to that rider.
        </p>
      </div>

      {toast && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2 text-sm text-green-400">
          {toast}
        </div>
      )}

      {/* Top senders today */}
      <div>
        <h2 className="text-[11px] font-bold tracking-[2.5px] text-neutral-500 mb-2">TOP SENDERS TODAY (ET)</h2>
        {topSenders.length === 0 ? (
          <div className="text-neutral-600 text-xs">No HMUs sent today.</div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {topSenders.map((s) => (
              <div
                key={s.driver_id}
                className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 flex-shrink-0 min-w-[160px]"
              >
                <div className="text-xs font-semibold text-white truncate">
                  {s.driver_name || 'Driver'}
                </div>
                <div className="text-[11px] text-neutral-500">@{s.driver_handle || '—'}</div>
                <div className="text-xl font-bold text-[#00E676] mt-1">{s.sends}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent HMUs */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500">
                <th className="text-left p-3 font-medium">Time</th>
                <th className="text-left p-3 font-medium">Driver</th>
                <th className="text-left p-3 font-medium">Rider</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Message</th>
                <th className="text-right p-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-neutral-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-neutral-500">No HMUs{selectedMarket ? ` in ${selectedMarket.name}` : ''} yet.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-800/50 hover:bg-white/5">
                    <td className="p-3 text-neutral-400 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="text-white truncate max-w-[160px]">{r.driver_name || 'Driver'}</div>
                      <div className="text-[10px] text-neutral-500">@{r.driver_handle || '—'}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-white truncate max-w-[160px]">@{r.rider_handle || '—'}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusStyle[r.status] || 'bg-neutral-700 text-neutral-300'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-300 max-w-[280px] truncate">{r.message || '—'}</td>
                    <td className="p-3 text-right">
                      {(r.status === 'active' || r.status === 'linked') && (
                        <button
                          onClick={() => handleRevoke(r.id)}
                          disabled={revoking === r.id}
                          className="text-red-400 hover:text-red-300 disabled:text-neutral-600 text-xs font-medium"
                        >
                          {revoking === r.id ? '…' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
