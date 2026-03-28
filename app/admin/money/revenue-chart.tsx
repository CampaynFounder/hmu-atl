'use client';

interface DailyRevenue {
  day: string;
  revenue: number;
  gmv: number;
  rides: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export function RevenueChart({ data }: { data: DailyRevenue[] }) {
  if (data.length === 0) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-4">Daily Revenue (30 days)</h2>
        <p className="text-sm text-neutral-500 text-center py-12">No revenue data yet</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const maxGmv = Math.max(...data.map((d) => d.gmv), 1);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <h2 className="text-sm font-semibold mb-4">Daily Revenue (30 days)</h2>

      {/* Simple bar chart */}
      <div className="flex items-end gap-1 h-48">
        {data.map((d, i) => {
          const revHeight = (d.revenue / maxRevenue) * 100;
          const gmvHeight = (d.gmv / maxGmv) * 100;
          const dayLabel = new Date(d.day).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-xs whitespace-nowrap shadow-lg">
                  <p className="font-medium">{dayLabel}</p>
                  <p className="text-green-400">Rev: {fmt(d.revenue)}</p>
                  <p className="text-neutral-400">GMV: {fmt(d.gmv)}</p>
                  <p className="text-neutral-500">{d.rides} rides</p>
                </div>
              </div>

              {/* Bars */}
              <div className="w-full flex gap-px justify-center">
                <div
                  className="w-1/2 bg-green-500/60 rounded-t-sm transition-all hover:bg-green-500"
                  style={{ height: `${revHeight}%`, minHeight: d.revenue > 0 ? '2px' : '0px' }}
                />
                <div
                  className="w-1/2 bg-neutral-600/40 rounded-t-sm transition-all hover:bg-neutral-500"
                  style={{ height: `${gmvHeight}%`, minHeight: d.gmv > 0 ? '2px' : '0px' }}
                />
              </div>

              {/* Day label (show every few days) */}
              {(i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
                <span className="text-[9px] text-neutral-600 mt-1 -rotate-45 origin-left">{dayLabel}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 justify-center">
        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span className="w-3 h-2 bg-green-500/60 rounded-sm" />
          Revenue
        </div>
        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span className="w-3 h-2 bg-neutral-600/40 rounded-sm" />
          GMV
        </div>
      </div>

      {/* Totals */}
      <div className="flex gap-6 mt-3 justify-center text-xs text-neutral-500">
        <span>Total Rev: {fmt(data.reduce((s, d) => s + d.revenue, 0))}</span>
        <span>Total GMV: {fmt(data.reduce((s, d) => s + d.gmv, 0))}</span>
        <span>Total Rides: {data.reduce((s, d) => s + d.rides, 0)}</span>
      </div>
    </div>
  );
}
