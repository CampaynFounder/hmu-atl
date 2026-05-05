// Block: user.rides
//
// Last N rides where the user was driver or rider, with status, amount, and
// counterparty. Cross-market activity (admin_all_allowed marketScope) so a
// user who travels across markets doesn't have rides hidden.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';
import { BlockShell, EmptyState, Pill } from './_shell';

const configSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
}).strict();
type Config = z.infer<typeof configSchema>;

interface RideRow {
  id: string;
  status: string;
  role: 'driver' | 'rider';
  amount: number | null;
  counterparty_name: string | null;
  counterparty_handle: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  created_at: string;
}

interface RidesData {
  rides: RideRow[];
}

async function fetchRides(ctx: BlockFetchContext, config: Config): Promise<RidesData> {
  if (!ctx.userId) throw new Error('user.rides requires userId');

  const marketFilter = ctx.marketIds && ctx.marketIds.length > 0;
  const rows = marketFilter
    ? await sql`
        SELECT
          r.id, r.status, r.created_at, r.pickup_address, r.dropoff_address,
          COALESCE(r.final_agreed_price, r.amount) AS amount,
          CASE WHEN r.driver_id = ${ctx.userId} THEN 'driver' ELSE 'rider' END AS role,
          CASE WHEN r.driver_id = ${ctx.userId} THEN r.rider_id ELSE r.driver_id END AS counterparty_id
        FROM rides r
        WHERE (r.driver_id = ${ctx.userId} OR r.rider_id = ${ctx.userId})
          AND r.market_id = ANY(${ctx.marketIds}::uuid[])
        ORDER BY r.created_at DESC
        LIMIT ${config.limit}
      `
    : await sql`
        SELECT
          r.id, r.status, r.created_at, r.pickup_address, r.dropoff_address,
          COALESCE(r.final_agreed_price, r.amount) AS amount,
          CASE WHEN r.driver_id = ${ctx.userId} THEN 'driver' ELSE 'rider' END AS role,
          CASE WHEN r.driver_id = ${ctx.userId} THEN r.rider_id ELSE r.driver_id END AS counterparty_id
        FROM rides r
        WHERE r.driver_id = ${ctx.userId} OR r.rider_id = ${ctx.userId}
        ORDER BY r.created_at DESC
        LIMIT ${config.limit}
      `;

  if (rows.length === 0) return { rides: [] };

  const counterpartyIds = Array.from(new Set(rows.map((r: Record<string, unknown>) => r.counterparty_id as string).filter(Boolean)));
  const cpRows = counterpartyIds.length > 0
    ? await sql`
        SELECT u.id,
               COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS name,
               COALESCE(dp.handle, rp.handle) AS handle
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
        WHERE u.id = ANY(${counterpartyIds}::uuid[])
      `
    : [];
  const cpMap = new Map<string, { name: string | null; handle: string | null }>();
  for (const r of cpRows) {
    cpMap.set(r.id as string, {
      name: (r.name as string | null) ?? null,
      handle: (r.handle as string | null) ?? null,
    });
  }

  return {
    rides: rows.map((r: Record<string, unknown>) => {
      const cpId = r.counterparty_id as string | null;
      const cp = cpId ? cpMap.get(cpId) : null;
      return {
        id: r.id as string,
        status: r.status as string,
        role: r.role as 'driver' | 'rider',
        amount: r.amount != null ? Number(r.amount) : null,
        counterparty_name: cp?.name ?? null,
        counterparty_handle: cp?.handle ?? null,
        pickup_address: (r.pickup_address as string | null) ?? null,
        dropoff_address: (r.dropoff_address as string | null) ?? null,
        created_at: (r.created_at as Date).toISOString(),
      };
    }),
  };
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#4ade80',
  ended: '#4ade80',
  in_progress: '#60a5fa',
  pending: '#f59e0b',
  accepted: '#60a5fa',
  cancelled: '#f87171',
};

function RidesComponent({ data, config }: { data: RidesData; config: Config }) {
  if (data.rides.length === 0) {
    return (
      <BlockShell title="Recent rides">
        <EmptyState>No rides yet.</EmptyState>
      </BlockShell>
    );
  }
  return (
    <BlockShell
      title="Recent rides"
      subtitle={`Last ${data.rides.length}${data.rides.length === config.limit ? ' (cap)' : ''}`}
    >
      <div className="space-y-2">
        {data.rides.map((r) => {
          const date = new Date(r.created_at).toLocaleDateString();
          const cp = r.counterparty_name || r.counterparty_handle || 'unknown';
          const route = r.pickup_address && r.dropoff_address
            ? `${truncate(r.pickup_address, 30)} → ${truncate(r.dropoff_address, 30)}`
            : null;
          return (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 text-xs py-1.5 border-b last:border-0"
              style={{ borderColor: 'var(--admin-border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Pill color={STATUS_COLORS[r.status] ?? undefined}>{r.status}</Pill>
                  <span style={{ color: 'var(--admin-text-muted)' }}>
                    as {r.role} · with {cp}
                  </span>
                </div>
                {route && (
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--admin-text-muted)' }}>
                    {route}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {r.amount != null && (
                  <div className="text-xs font-medium" style={{ color: 'var(--admin-text)' }}>
                    ${r.amount.toFixed(2)}
                  </div>
                )}
                <div className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                  {date}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </BlockShell>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export const userRidesBlock: BlockDefinition<Config, RidesData> = {
  key: 'user.rides',
  label: 'Recent rides',
  description: 'Last N rides as driver or rider, with counterparty, route, amount, and status.',
  scope: 'user',
  marketAware: true,
  marketScope: 'admin_all_allowed',
  configSchema,
  defaultConfig: { limit: 20 },
  fetch: (ctx, config) => fetchRides(ctx, config),
  Component: RidesComponent,
};
