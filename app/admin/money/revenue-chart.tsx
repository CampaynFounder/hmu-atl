'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export interface DailyRevenue {
  day: string;
  revenue: number;
  gmv: number;
  stripeFees: number;
  rides: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const revenue = payload.find((p) => p.name === 'revenue')?.value ?? 0;
  const gmv = payload.find((p) => p.name === 'gmv')?.value ?? 0;
  const rides = payload.find((p) => p.name === 'rides')?.value ?? 0;
  const dateLabel = label
    ? new Date(label).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-neutral-300 font-medium mb-2">{dateLabel}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-neutral-400">Revenue</span>
          <span className="text-emerald-400 font-mono ml-auto">{fmt(revenue)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neutral-500 shrink-0" />
          <span className="text-neutral-400">GMV</span>
          <span className="text-neutral-300 font-mono ml-auto">{fmt(gmv)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
          <span className="text-neutral-400">Rides</span>
          <span className="text-blue-300 font-mono ml-auto">{rides}</span>
        </div>
      </div>
    </div>
  );
}

export function RevenueChart({ data }: { data: DailyRevenue[] }) {
  if (data.length === 0) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 h-[280px] flex flex-col">
        <h2 className="text-sm font-semibold mb-4">Daily Revenue (30 days)</h2>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-neutral-500">No revenue data yet</p>
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.day).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
  }));

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalGmv = data.reduce((s, d) => s + d.gmv, 0);
  const totalRides = data.reduce((s, d) => s + d.rides, 0);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold">Daily Revenue (30 days)</h2>
        <div className="flex gap-4 text-[10px]">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70 inline-block" />
            <span>Rev: <span className="text-emerald-400 font-mono">{fmt(totalRevenue)}</span></span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-neutral-600/70 inline-block" />
            <span>GMV: <span className="text-neutral-300 font-mono">{fmt(totalGmv)}</span></span>
          </div>
          <div className="flex items-center gap-1.5 text-neutral-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/50 inline-block" />
            <span>{totalRides} rides</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#525252" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#525252" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#404040', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            interval={Math.ceil(data.length / 7) - 1}
          />
          <YAxis
            tick={{ fill: '#404040', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v}`}
            width={34}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#333', strokeWidth: 1 }} />

          {/* GMV as background area */}
          <Area
            type="monotone"
            dataKey="gmv"
            name="gmv"
            stroke="#404040"
            strokeWidth={1}
            fill="url(#gmvGrad)"
            dot={false}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />

          {/* Revenue bars (platform take) */}
          <Bar
            dataKey="revenue"
            name="revenue"
            fill="#10b981"
            fillOpacity={0.7}
            radius={[2, 2, 0, 0]}
            maxBarSize={16}
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-out"
          />

          {/* Ride count as hidden area for tooltip */}
          <Area
            type="monotone"
            dataKey="rides"
            name="rides"
            stroke="transparent"
            fill="transparent"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
