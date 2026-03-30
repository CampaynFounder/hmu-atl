'use client';

import { useState, useEffect } from 'react';
import { useMarket } from '../components/market-context';
import { StatCard } from '../components/stat-card';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface Analytics {
  period: { days: number };
  utilization: { percent: number; bookedHours: number; scheduledHours: number; driversWithSchedule: number; driversWithBookings: number };
  peakHours: { heatmap: number[][] };
  advanceBooking: { rate: number; total: number; advance: number; onDemand: number };
  adherence: { rate: number; totalScheduled: number; actuallyActive: number };
  conflictsBlocked: number;
  topDrivers: { driverId: string; handle: string; displayName: string; rideBookings: number; hoursBooked: number }[];
  recentEvents: { type: string; driverHandle: string; details: Record<string, unknown>; createdAt: string }[];
}

export default function ScheduleAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const { selectedMarketId } = useMarket();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ period });
    if (selectedMarketId) params.set('marketId', selectedMarketId);
    fetch(`/api/admin/schedule-analytics?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period, selectedMarketId]);

  if (loading) return <div className="space-y-4"><h1 className="text-xl font-bold">Schedule Analytics</h1><div className="bg-neutral-900 rounded-xl h-96 animate-pulse" /></div>;
  if (!data) return <div className="text-neutral-500">Failed to load analytics</div>;

  const maxHeat = Math.max(1, ...data.peakHours.heatmap.flat());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Schedule Analytics</h1>
        <div className="flex gap-2">
          {['7d', '14d', '30d'].map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}
            >
              {p === '7d' ? '7 days' : p === '14d' ? '14 days' : '30 days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Utilization" value={`${data.utilization.percent}%`} subtitle={`${data.utilization.bookedHours}h / ${data.utilization.scheduledHours}h`} color="green" />
        <StatCard label="Advance Bookings" value={`${data.advanceBooking.rate}%`} subtitle={`${data.advanceBooking.advance} of ${data.advanceBooking.total}`} color="blue" />
        <StatCard label="Adherence" value={`${data.adherence.rate}%`} subtitle={`${data.adherence.actuallyActive} of ${data.adherence.totalScheduled} active`} color="white" />
        <StatCard label="Conflicts Blocked" value={data.conflictsBlocked} color={data.conflictsBlocked > 0 ? 'yellow' : 'white'} />
        <StatCard label="Scheduled Drivers" value={data.utilization.driversWithSchedule} subtitle={`${data.utilization.driversWithBookings} with bookings`} color="green" />
      </div>

      {/* Peak Hours Heatmap */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-4">Peak Hours</h2>
        <div className="overflow-x-auto">
          <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(24, 1fr)', gap: 2, minWidth: 600 }}>
            {/* Hour headers */}
            <div />
            {HOURS.map(h => (
              <div key={h} style={{ fontSize: 9, color: '#666', textAlign: 'center', fontFamily: "'Space Mono', monospace" }}>
                {h > 12 ? `${h - 12}p` : h === 0 ? '12a' : h === 12 ? '12p' : `${h}a`}
              </div>
            ))}
            {/* Day rows */}
            {DAYS.map((day, d) => (
              <>
                <div key={`label-${d}`} style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', fontFamily: "'Space Mono', monospace" }}>
                  {day}
                </div>
                {HOURS.map(h => {
                  const val = data.peakHours.heatmap[d]?.[h] || 0;
                  const intensity = val / maxHeat;
                  return (
                    <div
                      key={`${d}-${h}`}
                      title={`${day} ${h}:00 — ${val} booking${val !== 1 ? 's' : ''}`}
                      style={{
                        height: 20,
                        borderRadius: 3,
                        background: val === 0
                          ? 'rgba(255,255,255,0.03)'
                          : `rgba(0, 230, 118, ${0.15 + intensity * 0.65})`,
                        transition: 'background 0.2s',
                        cursor: 'default',
                      }}
                    />
                  );
                })}
              </>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span style={{ fontSize: 10, color: '#666' }}>Less</span>
          {[0.15, 0.3, 0.5, 0.7, 0.85].map((o, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(0,230,118,${o})` }} />
          ))}
          <span style={{ fontSize: 10, color: '#666' }}>More</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Drivers */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">Top Drivers by Bookings</h2>
          {data.topDrivers.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-6">No bookings yet</p>
          ) : (
            <div className="space-y-2">
              {data.topDrivers.map((d, i) => (
                <div key={d.driverId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                  <span className="text-xs font-bold text-neutral-600 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.handle ? `@${d.handle}` : d.displayName}</div>
                    <div className="text-xs text-neutral-500">{d.hoursBooked}h booked</div>
                  </div>
                  <span className="text-sm font-bold text-[#00E676]">{d.rideBookings}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Schedule Events */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3">Recent Activity</h2>
          {data.recentEvents.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-6">No schedule events yet</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {data.recentEvents.map((e, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                  <span className="text-base mt-0.5">
                    {e.type === 'hours_set' ? '🕐' :
                     e.type === 'booking_created' ? '📅' :
                     e.type === 'booking_cancelled' ? '❌' :
                     e.type === 'conflict_blocked' ? '🚫' :
                     e.type === 'time_blocked' ? '🔒' : '📋'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-neutral-300">
                      {e.driverHandle ? `@${e.driverHandle}` : 'Driver'} — {formatEventType(e.type)}
                    </div>
                    <div className="text-[10px] text-neutral-600">
                      {new Date(e.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatEventType(type: string): string {
  switch (type) {
    case 'hours_set': return 'Set working hours';
    case 'hours_updated': return 'Updated working hours';
    case 'booking_created': return 'New ride booked';
    case 'booking_cancelled': return 'Booking cancelled';
    case 'conflict_blocked': return 'Booking blocked (conflict)';
    case 'time_blocked': return 'Blocked time off';
    case 'time_unblocked': return 'Removed time block';
    default: return type;
  }
}
