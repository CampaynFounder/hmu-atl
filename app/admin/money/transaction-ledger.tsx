'use client';

import { useEffect, useState, useCallback } from 'react';

interface Transaction {
  rideId: string;
  status: string;
  amount: number;
  platformFee: number;
  stripeFee: number;
  driverPayout: number;
  driverName: string;
  driverHandle: string;
  riderName: string;
  driverTier: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function TransactionLedger() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ rideId: '', userId: '' });
  const [loading, setLoading] = useState(true);

  const fetchLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pagination.page) });
      if (filters.rideId) params.set('ride_id', filters.rideId);
      if (filters.userId) params.set('user_id', filters.userId);

      const res = await fetch(`/api/admin/money/ledger?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions);
        setPagination(data.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, filters.rideId, filters.userId]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const exportCsv = () => {
    const headers = ['Ride ID', 'Status', 'Amount', 'Platform Fee', 'Stripe Fee', 'Driver Payout', 'Driver', 'Rider', 'Tier', 'Date'];
    const rows = transactions.map((t) => [
      t.rideId, t.status, t.amount, t.platformFee, t.stripeFee, t.driverPayout,
      t.driverName, t.riderName, t.driverTier, new Date(t.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hmu-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-neutral-500 block mb-1">Ride ID</label>
          <input
            type="text"
            placeholder="Filter by ride ID..."
            value={filters.rideId}
            onChange={(e) => setFilters((f) => ({ ...f, rideId: e.target.value }))}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 w-52"
          />
        </div>
        <div>
          <label className="text-xs text-neutral-500 block mb-1">User ID</label>
          <input
            type="text"
            placeholder="Filter by user ID..."
            value={filters.userId}
            onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-neutral-600 w-52"
          />
        </div>
        <button
          onClick={() => { setPagination((p) => ({ ...p, page: 1 })); fetchLedger(); }}
          className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          Search
        </button>
        <button
          onClick={exportCsv}
          className="bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ml-auto"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-500">
                <th className="text-left p-3 font-medium">Ride ID</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Driver</th>
                <th className="text-left p-3 font-medium">Rider</th>
                <th className="text-right p-3 font-medium">Amount</th>
                <th className="text-right p-3 font-medium">Platform</th>
                <th className="text-right p-3 font-medium">Stripe</th>
                <th className="text-right p-3 font-medium">Driver Gets</th>
                <th className="text-left p-3 font-medium">Tier</th>
                <th className="text-left p-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-neutral-500">Loading...</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-neutral-500">No transactions found</td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.rideId} className="border-b border-neutral-800/50 hover:bg-white/5 transition-colors">
                    <td className="p-3 font-mono text-neutral-400">{t.rideId.slice(0, 8)}</td>
                    <td className="p-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        t.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        t.status === 'disputed' ? 'bg-red-500/20 text-red-400' :
                        'bg-neutral-500/20 text-neutral-400'
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="p-3 text-white">{t.driverName ?? 'Unknown'}</td>
                    <td className="p-3 text-white">{t.riderName ?? 'Unknown'}</td>
                    <td className="p-3 text-right text-white">{fmt(t.amount)}</td>
                    <td className="p-3 text-right text-green-400">{fmt(t.platformFee)}</td>
                    <td className="p-3 text-right text-red-400">{fmt(t.stripeFee)}</td>
                    <td className="p-3 text-right text-blue-400">{fmt(t.driverPayout)}</td>
                    <td className="p-3">
                      <span className={`text-[10px] ${t.driverTier === 'hmu_first' ? 'text-blue-400' : 'text-neutral-500'}`}>
                        {t.driverTier === 'hmu_first' ? 'HMU First' : 'Free'}
                      </span>
                    </td>
                    <td className="p-3 text-neutral-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-neutral-800">
            <span className="text-xs text-neutral-500">
              {pagination.total} transaction{pagination.total !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page <= 1}
                className="text-xs px-2 py-1 rounded bg-white/5 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-xs text-neutral-500 self-center">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="text-xs px-2 py-1 rounded bg-white/5 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
