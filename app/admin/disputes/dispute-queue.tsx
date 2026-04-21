'use client';

import { useEffect, useState, useCallback } from 'react';
import { DisputeDetail } from './dispute-detail';
import { useMarket } from '@/app/admin/components/market-context';

interface DisputeItem {
  id: string;
  rideId: string;
  filedBy: string;
  filerName: string;
  filerType: string;
  filerDisputeCount: number;
  filerCompletedRides: number;
  reason: string;
  status: string;
  rideAmount: number;
  driverName: string;
  riderName: string;
  createdAt: string;
  timeSinceFiled: number;
}

type StatusFilter = 'open' | 'under_review' | 'resolved_driver' | 'resolved_rider' | 'closed';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function DisputeQueue() {
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { selectedMarketId } = useMarket();

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      const mq = selectedMarketId ? `&marketId=${selectedMarketId}` : '';
      const res = await fetch(`/api/admin/disputes?status=${statusFilter}${mq}`);
      if (res.ok) {
        const data = await res.json();
        setDisputes(data.disputes ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch disputes:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedMarketId]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const handleResolved = () => {
    setSelectedId(null);
    fetchDisputes();
  };

  if (selectedId) {
    return (
      <div>
        <button
          onClick={() => setSelectedId(null)}
          className="text-xs text-neutral-500 hover:text-white mb-4 flex items-center gap-1"
        >
          &larr; Back to queue
        </button>
        <DisputeDetail disputeId={selectedId} onResolved={handleResolved} />
      </div>
    );
  }

  const statuses: StatusFilter[] = ['open', 'under_review', 'resolved_driver', 'resolved_rider', 'closed'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Dispute Queue</h1>
        <span className="text-xs text-neutral-500">{disputes.length} dispute{disputes.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
              statusFilter === s
                ? 'bg-white/10 text-white'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-500 hover:text-white'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Dispute Cards */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : disputes.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
          <p className="text-neutral-500 text-sm">No disputes with status "{statusFilter.replace('_', ' ')}"</p>
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map((dispute) => {
            const isEscalated = dispute.filerDisputeCount >= 3;

            return (
              <button
                key={dispute.id}
                onClick={() => setSelectedId(dispute.id)}
                className="w-full text-left bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-neutral-500">{dispute.rideId.slice(0, 8)}</span>
                      {isEscalated && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
                          PATTERN FLAG
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-600">
                        {formatDuration(dispute.timeSinceFiled)} ago
                      </span>
                    </div>
                    <p className="text-sm text-white mt-1">
                      <span className="text-neutral-400">{dispute.riderName}</span>
                      {' vs '}
                      <span className="text-neutral-400">{dispute.driverName}</span>
                    </p>
                    {dispute.reason && (
                      <p className="text-xs text-neutral-500 mt-1 truncate max-w-lg">{dispute.reason}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">{fmt(dispute.rideAmount)}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      Filed by {dispute.filerName}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
