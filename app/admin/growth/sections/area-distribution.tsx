'use client';

export interface AreaRow {
  slug: string;
  name: string;
  cardinal: string;
  driverCount: number;
  pct: number;
}

interface Props {
  loading: boolean;
  marketName: string | null;
  totalDrivers: number;
  areas: AreaRow[];
  gapsCount: number;
  marketSelected: boolean;
}

const CARDINAL_DOT: Record<string, string> = {
  westside: 'bg-amber-400',
  eastside: 'bg-cyan-400',
  northside: 'bg-emerald-400',
  southside: 'bg-rose-400',
  central: 'bg-violet-400',
};

export function AreaDistribution({ loading, marketName, totalDrivers, areas, gapsCount, marketSelected }: Props) {
  if (!marketSelected) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-300 mb-2">Driver Coverage by Area</h2>
        <p className="text-sm text-neutral-500">Select a market in the sidebar to see area-level driver distribution.</p>
      </div>
    );
  }

  const maxPct = areas.length > 0 ? Math.max(...areas.map((a) => a.pct), 1) : 1;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-300">
            Driver Coverage by Area{marketName ? ` · ${marketName}` : ''}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            % of active drivers who list each area. Drivers in multiple areas count in each.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-500">{totalDrivers} active drivers</p>
          {gapsCount > 0 && (
            <p className="text-xs text-red-400 font-medium mt-0.5">
              {gapsCount} area{gapsCount === 1 ? '' : 's'} with 0 drivers — recruitment gap
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : areas.length === 0 ? (
        <p className="text-sm text-neutral-500">No areas configured for this market.</p>
      ) : (
        <ul className="space-y-1.5">
          {areas.map((a) => {
            const isGap = a.driverCount === 0;
            const widthPct = (a.pct / maxPct) * 100;
            return (
              <li key={a.slug} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full shrink-0 ${CARDINAL_DOT[a.cardinal] ?? 'bg-neutral-500'}`} />
                <span className="w-32 md:w-40 truncate text-neutral-300">{a.name}</span>
                <div className="flex-1 relative h-5 bg-neutral-950 rounded border border-neutral-800 overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 transition-all duration-700 ${
                      isGap ? 'bg-red-500/20 border-r border-red-500/60' : 'bg-violet-500/30'
                    }`}
                    style={{ width: `${Math.max(widthPct, isGap ? 2 : 0)}%` }}
                  />
                </div>
                <span className={`w-20 text-right text-xs tabular-nums ${isGap ? 'text-red-400' : 'text-neutral-300'}`}>
                  {a.driverCount} <span className="text-neutral-500">({a.pct}%)</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
