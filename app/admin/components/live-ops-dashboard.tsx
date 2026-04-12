'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAbly } from '@/hooks/use-ably';
import { StatCard } from './stat-card';
import { AlertBadge } from './alert-badge';
import { LiveMap } from './live-map';
import { useMarket } from './market-context';
import { NewUsersSheet } from './new-users-sheet';

interface Stats {
  rides: { matched: number; active: number; completed: number; cancelled: number; disputed: number };
  revenue: { totalCaptured: number; platformFees: number; feesWaived: number; allTimeCaptured: number; allTimeRides: number };
  users: { newRiders: number; newDrivers: number };
  drivers: { onRide: number };
}

interface ActiveRide {
  id: string;
  status: string;
  price: number;
  isCash: boolean;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  driverName: string;
  driverHandle: string | null;
  riderName: string;
  riderHandle: string | null;
  lastLat: number | null;
  lastLng: number | null;
  lastGpsAt: string | null;
  hasLiveGps: boolean;
  createdAt: string;
  updatedAt: string;
  otwAt: string | null;
  hereAt: string | null;
  startedAt: string | null;
}

interface Alert {
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  rideId?: string;
  disputeId?: string;
  userId?: string;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

interface NewSinceSummary {
  newUsers: { riders: number; drivers: number; total: number };
  incomplete: { riders: number; drivers: number; total: number };
}

export function LiveOpsDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rides, setRides] = useState<ActiveRide[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSince, setNewSince] = useState<NewSinceSummary | null>(null);
  const [sheetBucket, setSheetBucket] = useState<'new_users' | 'incomplete' | null>(null);
  const { selectedMarketId } = useMarket();

  // Stable reference so the sheet's useEffect doesn't re-fire on every render.
  const handleCloseSheet = useCallback(() => setSheetBucket(null), []);
  const handleResetCursor = useCallback(() => {
    setNewSince((prev) => (prev ? { ...prev, newUsers: { riders: 0, drivers: 0, total: 0 } } : prev));
  }, []);

  const fetchAll = useCallback(async () => {
    const mq = selectedMarketId ? `?marketId=${selectedMarketId}` : '';
    try {
      const [statsRes, ridesRes, alertsRes, newSinceRes] = await Promise.all([
        fetch(`/api/admin/stats${mq}`),
        fetch(`/api/admin/rides/active${mq}`),
        fetch(`/api/admin/alerts${mq}`),
        fetch(`/api/admin/users/new-since`),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (ridesRes.ok) {
        const data = await ridesRes.json();
        setRides(data.rides ?? []);
      }
      if (alertsRes.ok) {
        const data = await alertsRes.json();
        setAlerts(data.alerts ?? []);
      }
      if (newSinceRes.ok) setNewSince(await newSinceRes.json());
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMarketId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Re-fetch on admin:feed events — skip GPS updates (map handles those)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAdminEvent = useCallback((msg: { name: string; data: unknown }) => {
    // GPS events are handled directly by the LiveMap — no need to refetch stats
    if (msg.name === 'driver_location') return;
    // Debounce rapid events (e.g. rewind replay) to avoid hammering the API
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchAll(), 500);
  }, [fetchAll]);

  const { connected: ablyConnected } = useAbly({
    channelName: 'admin:feed',
    onMessage: handleAdminEvent,
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Live Operations</h1>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 animate-pulse h-20" />
          ))}
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl h-96 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Live Operations</h1>
        <span className="text-xs text-neutral-500">
          {ablyConnected ? '🟢 Live' : '🔴 Connecting...'}
        </span>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label="Matched"
          value={stats?.rides.matched ?? 0}
          color="blue"
        />
        <StatCard
          label="Active"
          value={stats?.rides.active ?? 0}
          color="green"
        />
        <StatCard
          label="Completed"
          value={stats?.rides.completed ?? 0}
          color="white"
        />
        <StatCard
          label="Revenue"
          value={fmt(stats?.revenue.totalCaptured ?? 0)}
          subtitle={
            (stats?.revenue.totalCaptured ?? 0) > 0
              ? `Fees: ${fmt(stats?.revenue.platformFees ?? 0)}`
              : `All-time: ${fmt(stats?.revenue.allTimeCaptured ?? 0)} (${stats?.revenue.allTimeRides ?? 0} rides)`
          }
          color="green"
        />
        <button
          type="button"
          disabled={!newSince || newSince.newUsers.total === 0}
          onClick={() => setSheetBucket('new_users')}
          className="text-left disabled:cursor-default cursor-pointer"
        >
          <StatCard
            label="New Users (since last visit)"
            value={newSince?.newUsers.total ?? 0}
            subtitle={`${newSince?.newUsers.riders ?? 0} R / ${newSince?.newUsers.drivers ?? 0} D${newSince && newSince.newUsers.total > 0 ? ' · click to view' : ''}`}
            color="blue"
          />
        </button>
      </div>

      {/* Incomplete Signups — separate outreach bucket, all-time */}
      {newSince && newSince.incomplete.total > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setSheetBucket('incomplete')}
            className="text-left cursor-pointer"
          >
            <StatCard
              label="Incomplete Signups (outreach queue)"
              value={newSince.incomplete.total}
              subtitle={`${newSince.incomplete.riders} R / ${newSince.incomplete.drivers} D · click to reach out`}
              color="yellow"
            />
          </button>
        </div>
      )}

      <NewUsersSheet
        open={sheetBucket !== null}
        bucket={sheetBucket ?? 'new_users'}
        onClose={handleCloseSheet}
        onResetCursor={handleResetCursor}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map View */}
        <div className="lg:col-span-2">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Active Rides Map</h2>
              <span className="text-xs text-neutral-500">{rides.length} ride{rides.length !== 1 ? 's' : ''}</span>
            </div>
            <LiveMap rides={rides} onRidesRefresh={fetchAll} />
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="lg:col-span-1">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Alerts</h2>
              {alerts.length > 0 && (
                <span className="bg-red-500/20 text-red-400 text-xs font-medium px-2 py-0.5 rounded-full">
                  {alerts.length}
                </span>
              )}
            </div>
            <div className="p-3 space-y-2 max-h-[500px] overflow-y-auto">
              {alerts.length === 0 ? (
                <p className="text-sm text-neutral-500 text-center py-8">No active alerts</p>
              ) : (
                alerts.map((alert, i) => (
                  <AlertBadge
                    key={i}
                    type={alert.type}
                    severity={alert.severity}
                    message={alert.message}
                    timestamp={alert.timestamp}
                  />
                ))
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard
              label="Cancelled"
              value={stats?.rides.cancelled ?? 0}
              color="red"
            />
            <StatCard
              label="Disputed"
              value={stats?.rides.disputed ?? 0}
              color="yellow"
            />
            <StatCard
              label="Drivers Active"
              value={stats?.drivers.onRide ?? 0}
              color="green"
            />
            <StatCard
              label="Fees Waived"
              value={fmt(stats?.revenue.feesWaived ?? 0)}
              color="yellow"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
