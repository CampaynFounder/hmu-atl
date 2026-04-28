'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export type SignupSeries = { date: string; riders: number; drivers: number }[];

interface Props {
  loading: boolean;
  layout: 'side' | 'stacked';
  range: '7d' | '30d' | '90d';
  series: SignupSeries;
  totalsInRange: { riders: number; drivers: number };
  weekOverWeek: {
    riders: { last: number; prev: number; pct: number };
    drivers: { last: number; prev: number; pct: number };
  };
  allTime: { riders: number; drivers: number };
}

const RIDER_COLOR = '#22d3ee'; // cyan-400
const DRIVER_COLOR = '#a855f7'; // purple-500

function formatTick(date: string, range: '7d' | '30d' | '90d'): string {
  const d = new Date(date + 'T00:00:00Z');
  if (range === '7d') return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function deltaLabel(pct: number): { text: string; color: string } {
  if (pct === 0) return { text: 'flat WoW', color: 'text-neutral-500' };
  const sign = pct > 0 ? '+' : '';
  return {
    text: `${sign}${pct}% WoW`,
    color: pct > 0 ? 'text-emerald-400' : 'text-red-400',
  };
}

export function SignupCharts({ loading, layout, range, series, totalsInRange, weekOverWeek, allTime }: Props) {
  const riderDelta = deltaLabel(weekOverWeek.riders.pct);
  const driverDelta = deltaLabel(weekOverWeek.drivers.pct);

  const chartData = series.map((p) => ({
    label: formatTick(p.date, range),
    Riders: p.riders,
    Drivers: p.drivers,
  }));

  const stackId = layout === 'stacked' ? '1' : undefined;

  if (loading) {
    return <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-sm text-neutral-500">Loading signups…</div>;
  }

  if (layout === 'stacked') {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <div className="flex items-baseline justify-between mb-4 flex-wrap gap-3">
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Signups · {range}</p>
            <p className="text-2xl font-bold mt-1">
              <span style={{ color: RIDER_COLOR }}>{totalsInRange.riders}</span>
              <span className="text-neutral-600 mx-2">/</span>
              <span style={{ color: DRIVER_COLOR }}>{totalsInRange.drivers}</span>
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              riders / drivers · all-time {allTime.riders} / {allTime.drivers}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-xs font-medium ${riderDelta.color}`}>R: {riderDelta.text}</p>
            <p className={`text-xs font-medium ${driverDelta.color}`}>D: {driverDelta.text}</p>
          </div>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#262626' }} tickLine={false} />
              <YAxis tick={{ fill: '#737373', fontSize: 11 }} axisLine={{ stroke: '#262626' }} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#a3a3a3' }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Riders" stackId={stackId} fill={RIDER_COLOR} radius={[4, 4, 0, 0]} animationDuration={700} />
              <Bar dataKey="Drivers" stackId={stackId} fill={DRIVER_COLOR} radius={[4, 4, 0, 0]} animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Side-by-side: two cards, two chart instances
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <SignupCard
        label="Riders"
        color={RIDER_COLOR}
        totalInRange={totalsInRange.riders}
        allTime={allTime.riders}
        delta={riderDelta}
        last7={weekOverWeek.riders.last}
        chartData={chartData}
        dataKey="Riders"
        range={range}
      />
      <SignupCard
        label="Drivers"
        color={DRIVER_COLOR}
        totalInRange={totalsInRange.drivers}
        allTime={allTime.drivers}
        delta={driverDelta}
        last7={weekOverWeek.drivers.last}
        chartData={chartData}
        dataKey="Drivers"
        range={range}
      />
    </div>
  );
}

interface CardProps {
  label: string;
  color: string;
  totalInRange: number;
  allTime: number;
  delta: { text: string; color: string };
  last7: number;
  chartData: { label: string; Riders: number; Drivers: number }[];
  dataKey: 'Riders' | 'Drivers';
  range: '7d' | '30d' | '90d';
}

function SignupCard({ label, color, totalInRange, allTime, delta, last7, chartData, dataKey, range }: CardProps) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs text-neutral-500 uppercase tracking-wide">{label} · {range}</p>
        <span className={`text-xs font-medium ${delta.color}`}>{delta.text}</span>
      </div>
      <p className="text-3xl font-bold" style={{ color }}>{totalInRange}</p>
      <p className="text-xs text-neutral-500 mt-1">
        last 7d: {last7} · all-time: {allTime}
      </p>
      <div style={{ width: '100%', height: 180, marginTop: 12 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#737373', fontSize: 10 }} axisLine={{ stroke: '#262626' }} tickLine={false}
              interval={range === '90d' ? 13 : range === '30d' ? 4 : 0} />
            <YAxis tick={{ fill: '#737373', fontSize: 10 }} axisLine={{ stroke: '#262626' }} tickLine={false} allowDecimals={false} width={28} />
            <Tooltip
              contentStyle={{ background: '#0a0a0a', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#a3a3a3' }}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
