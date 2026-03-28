'use client';

import { useEffect, useState, useCallback } from 'react';

interface PendingDriver {
  id: string;
  clerkId: string;
  name: string;
  handle: string;
  videoUrl: string;
  vehicleInfo: Record<string, unknown>;
  areas: Record<string, unknown>;
  createdAt: string;
}

export function PendingQueue() {
  const [pending, setPending] = useState<PendingDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users/pending');
      if (res.ok) {
        const data = await res.json();
        setPending(data.pending ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch pending:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleAction = async (userId: string, action: 'approve' | 'reject', rejectReason?: string) => {
    setActing(userId);
    try {
      const res = await fetch('/api/admin/users/pending', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, rejectReason }),
      });
      if (res.ok) {
        setPending((prev) => prev.filter((p) => p.id !== userId));
      }
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-48" />
        ))}
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
        <p className="text-neutral-500 text-sm">No drivers pending activation</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">{pending.length} driver{pending.length !== 1 ? 's' : ''} awaiting review</p>

      {pending.map((driver) => (
        <div key={driver.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">{driver.name}</h3>
              {driver.handle && <p className="text-xs text-neutral-500">@{driver.handle}</p>}
              <p className="text-[10px] text-neutral-600 mt-1">
                Applied {new Date(driver.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Video */}
          {driver.videoUrl ? (
            <div className="mb-3">
              <p className="text-xs text-neutral-500 mb-1">Video Intro</p>
              <video
                src={driver.videoUrl}
                controls
                className="w-full max-w-sm rounded-lg bg-black"
              />
            </div>
          ) : (
            <div className="mb-3 p-4 bg-neutral-800 rounded-lg text-center">
              <p className="text-xs text-neutral-500">No video uploaded</p>
            </div>
          )}

          {/* Vehicle Info */}
          {driver.vehicleInfo && Object.keys(driver.vehicleInfo).length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-neutral-500 mb-1">Vehicle</p>
              <p className="text-xs text-white">{JSON.stringify(driver.vehicleInfo)}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-neutral-800">
            <button
              onClick={() => handleAction(driver.id, 'approve')}
              disabled={acting === driver.id}
              className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {acting === driver.id ? 'Processing...' : 'Approve'}
            </button>
            <button
              onClick={() => {
                const reason = prompt('Rejection reason:');
                if (reason) handleAction(driver.id, 'reject', reason);
              }}
              disabled={acting === driver.id}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
