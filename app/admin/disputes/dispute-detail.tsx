'use client';

import { useEffect, useState, useCallback } from 'react';

interface DisputeData {
  dispute: {
    id: string;
    rideId: string;
    filedBy: string;
    reason: string;
    status: string;
    adminNotes: string;
    createdAt: string;
  };
  ride: {
    status: string;
    price: number;
    applicationFee: number;
    pickup: Record<string, unknown>;
    dropoff: Record<string, unknown>;
    paymentIntentId: string;
    createdAt: string;
    updatedAt: string;
  };
  driver: {
    id: string;
    name: string;
    handle: string;
    chillScore: number;
    completedRides: number;
    disputeCount: number;
    tier: string;
  };
  rider: {
    id: string;
    name: string;
    chillScore: number;
    completedRides: number;
    disputeCount: number;
    ogStatus: boolean;
  };
  gpsTrail: { lat: number; lng: number; recordedAt: string }[];
  ratings: { type: string; raterId: string; ratedId: string; createdAt: string }[];
  flags: { type: string; message: string }[];
}

interface Analysis {
  summary: string;
  recommendation: string;
  confidence: number;
  error?: string;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function DisputeDetail({ disputeId, onResolved }: { disputeId: string; onResolved: () => void }) {
  const [data, setData] = useState<DisputeData | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzingAi, setAnalyzingAi] = useState(false);
  const [notes, setNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch dispute detail:', err);
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const runAnalysis = async () => {
    setAnalyzingAi(true);
    try {
      const res = await fetch(`/api/admin/disputes/${disputeId}/analyze`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        setAnalysis(d.analysis);
      }
    } catch {
      setAnalysis({ summary: 'Analysis failed', recommendation: 'escalate', confidence: 0 });
    } finally {
      setAnalyzingAi(false);
    }
  };

  const resolveDispute = async (action: string) => {
    setResolving(true);
    try {
      const res = await fetch('/api/admin/disputes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeId, action, notes }),
      });
      if (res.ok) {
        onResolved();
      }
    } catch (err) {
      console.error('Failed to resolve dispute:', err);
    } finally {
      setResolving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  const { dispute, ride, driver, rider, gpsTrail, ratings, flags } = data;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Dispute: {dispute.id.slice(0, 8)}</h2>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="space-y-2">
          {flags.map((flag, i) => (
            <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
              {flag.message}
            </div>
          ))}
        </div>
      )}

      {/* Ride Timeline */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Ride Timeline</h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-500">Ride Created</span>
            <span className="text-white">{new Date(ride.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Last Update</span>
            <span className="text-white">{new Date(ride.updatedAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Dispute Filed</span>
            <span className="text-yellow-400">{new Date(dispute.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Ride Status</span>
            <span className="text-white capitalize">{ride.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">GPS Points</span>
            <span className="text-white">{gpsTrail.length} recorded</span>
          </div>
        </div>
      </div>

      {/* Financial Details */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Financial Details</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-neutral-500">Ride Price</span>
            <p className="text-white text-lg font-bold">{fmt(ride.price)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Platform Fee</span>
            <p className="text-green-400 text-lg font-bold">{fmt(ride.applicationFee)}</p>
          </div>
          <div>
            <span className="text-neutral-500">Payment Intent</span>
            <p className="text-neutral-400 font-mono">{ride.paymentIntentId?.slice(0, 16) ?? 'N/A'}...</p>
          </div>
        </div>
      </div>

      {/* User Profiles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Driver: {driver.name}</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Handle</span>
              <span className="text-white">@{driver.handle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Chill Score</span>
              <span className="text-white">{driver.chillScore}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Rides</span>
              <span className="text-white">{driver.completedRides}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Disputes</span>
              <span className={driver.disputeCount > 2 ? 'text-red-400' : 'text-white'}>{driver.disputeCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Tier</span>
              <span className={driver.tier === 'hmu_first' ? 'text-blue-400' : 'text-neutral-400'}>{driver.tier === 'hmu_first' ? 'HMU First' : 'Free'}</span>
            </div>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Rider: {rider.name}</h3>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Chill Score</span>
              <span className="text-white">{rider.chillScore}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Rides</span>
              <span className="text-white">{rider.completedRides}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Disputes</span>
              <span className={rider.disputeCount > 2 ? 'text-red-400' : 'text-white'}>{rider.disputeCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">OG Status</span>
              <span className={rider.ogStatus ? 'text-yellow-400' : 'text-neutral-500'}>{rider.ogStatus ? 'OG' : 'No'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ratings from this ride */}
      {ratings.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Ratings from this Ride</h3>
          <div className="space-y-2">
            {ratings.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded font-medium ${
                  r.type === 'weirdo' ? 'bg-red-500/20 text-red-400' :
                  r.type === 'kinda_creepy' ? 'bg-yellow-500/20 text-yellow-400' :
                  r.type === 'cool_af' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-green-500/20 text-green-400'
                }`}>
                  {r.type.replace('_', ' ').toUpperCase()}
                </span>
                <span className="text-neutral-500">
                  {r.raterId === driver.id ? driver.name : rider.name} rated {r.ratedId === driver.id ? driver.name : rider.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Analysis */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">AI Analysis</h3>
          {!analysis && (
            <button
              onClick={runAnalysis}
              disabled={analyzingAi}
              className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {analyzingAi ? 'Analyzing...' : 'Run Analysis'}
            </button>
          )}
        </div>
        {analysis ? (
          <div className="space-y-3 text-xs">
            <div>
              <p className="text-neutral-500 mb-1">Summary</p>
              <p className="text-white">{analysis.summary}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-neutral-500 mb-1">Recommendation</p>
                <span className={`px-2 py-1 rounded font-medium ${
                  analysis.recommendation.includes('driver') ? 'bg-blue-500/20 text-blue-400' :
                  analysis.recommendation.includes('rider') ? 'bg-green-500/20 text-green-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {analysis.recommendation.replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <p className="text-neutral-500 mb-1">Confidence</p>
                <p className="text-white font-bold">{analysis.confidence}%</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-neutral-600 text-xs">Click "Run Analysis" to get GPT-4o-mini assessment</p>
        )}
      </div>

      {/* Dispute Reason */}
      {dispute.reason && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">Reason Filed</h3>
          <p className="text-sm text-neutral-300">{dispute.reason}</p>
        </div>
      )}

      {/* Admin Notes + Actions */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Resolution</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Admin notes..."
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm text-white placeholder:text-neutral-600 resize-none h-20 mb-4"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => resolveDispute('resolve_driver')}
            disabled={resolving}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Resolve for Driver
          </button>
          <button
            onClick={() => resolveDispute('resolve_rider')}
            disabled={resolving}
            className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Resolve for Rider
          </button>
          <button
            onClick={() => resolveDispute('escalate')}
            disabled={resolving}
            className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Escalate
          </button>
          <button
            onClick={() => resolveDispute('close')}
            disabled={resolving}
            className="bg-neutral-700 hover:bg-neutral-600 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
