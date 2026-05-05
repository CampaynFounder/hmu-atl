// Ride history + dispute summary. Cross-market via admin_all_allowed.

import type { FieldDefinition } from './types';
import { StatTile, FieldList, fmtDate, fmtCurrency, toneForCount } from './renderers';

const STATUS_COLOR: Record<string, string> = {
  completed: '#4ade80',
  ended: '#4ade80',
  in_progress: '#60a5fa',
  pending: '#f59e0b',
  accepted: '#60a5fa',
  cancelled: '#f87171',
};

export const activityFields: FieldDefinition[] = [
  {
    key: 'aggregate.last_ride_at',
    label: 'Last ride',
    category: 'Activity',
    description: 'Most recent ride created_at (driver or rider).',
    applies_to: ['any'],
    render: 'stat',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const filter = ctx.marketIds && ctx.marketIds.length > 0;
      const [r] = filter
        ? await sql`SELECT MAX(created_at) AS v FROM rides
                    WHERE (driver_id = ${ctx.userId} OR rider_id = ${ctx.userId})
                      AND market_id = ANY(${ctx.marketIds}::uuid[])`
        : await sql`SELECT MAX(created_at) AS v FROM rides
                    WHERE driver_id = ${ctx.userId} OR rider_id = ${ctx.userId}`;
      return r?.v ? new Date(r.v as string).toISOString() : null;
    } },
    Render: ({ value }) => <StatTile label="Last ride" value={fmtDate(value as string | null)} />,
  },
  {
    key: 'aggregate.dispute_count',
    label: 'Disputes (total)',
    category: 'Activity',
    applies_to: ['any'],
    render: 'stat',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`
        SELECT COUNT(DISTINCT d.id)::int AS v
        FROM disputes d
        LEFT JOIN rides r ON r.id = d.ride_id
        WHERE d.filed_by = ${ctx.userId} OR r.driver_id = ${ctx.userId} OR r.rider_id = ${ctx.userId}`;
      return Number(r?.v ?? 0);
    } },
    Render: ({ value }) => {
      const n = Number(value ?? 0);
      return <StatTile label="Disputes" value={n} tone={toneForCount(n, 3, 1)} />;
    },
  },
  {
    key: 'aggregate.dispute_open_count',
    label: 'Open disputes',
    category: 'Activity',
    applies_to: ['any'],
    render: 'stat',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`
        SELECT COUNT(DISTINCT d.id)::int AS v
        FROM disputes d
        LEFT JOIN rides r ON r.id = d.ride_id
        WHERE d.status IN ('open','under_review')
          AND (d.filed_by = ${ctx.userId} OR r.driver_id = ${ctx.userId} OR r.rider_id = ${ctx.userId})`;
      return Number(r?.v ?? 0);
    } },
    Render: ({ value }) => {
      const n = Number(value ?? 0);
      return <StatTile label="Open disputes" value={n} tone={n > 0 ? 'bad' : undefined} />;
    },
  },
  {
    key: 'collection.recent_rides',
    label: 'Recent rides (last 20)',
    category: 'Activity',
    description: 'Last 20 rides where this user was driver or rider.',
    applies_to: ['any'],
    render: 'list',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'collection', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const filter = ctx.marketIds && ctx.marketIds.length > 0;
      const rows = filter
        ? await sql`
            SELECT r.id, r.status, r.created_at, r.pickup_address, r.dropoff_address,
                   COALESCE(r.final_agreed_price, r.amount) AS amount,
                   CASE WHEN r.driver_id = ${ctx.userId} THEN 'driver' ELSE 'rider' END AS role,
                   CASE WHEN r.driver_id = ${ctx.userId} THEN r.rider_id ELSE r.driver_id END AS counterparty_id
            FROM rides r
            WHERE (r.driver_id = ${ctx.userId} OR r.rider_id = ${ctx.userId})
              AND r.market_id = ANY(${ctx.marketIds}::uuid[])
            ORDER BY r.created_at DESC LIMIT 20`
        : await sql`
            SELECT r.id, r.status, r.created_at, r.pickup_address, r.dropoff_address,
                   COALESCE(r.final_agreed_price, r.amount) AS amount,
                   CASE WHEN r.driver_id = ${ctx.userId} THEN 'driver' ELSE 'rider' END AS role,
                   CASE WHEN r.driver_id = ${ctx.userId} THEN r.rider_id ELSE r.driver_id END AS counterparty_id
            FROM rides r
            WHERE r.driver_id = ${ctx.userId} OR r.rider_id = ${ctx.userId}
            ORDER BY r.created_at DESC LIMIT 20`;
      // Fetch counterparty names in one query
      const cpIds = Array.from(new Set(rows.map((r: Record<string, unknown>) => r.counterparty_id as string).filter(Boolean)));
      const cpMap = new Map<string, string>();
      if (cpIds.length > 0) {
        const cps = await sql`
          SELECT u.id, COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS name
          FROM users u
          LEFT JOIN driver_profiles dp ON dp.user_id = u.id
          LEFT JOIN rider_profiles rp ON rp.user_id = u.id
          WHERE u.id = ANY(${cpIds}::uuid[])`;
        for (const c of cps) cpMap.set(c.id as string, (c.name as string | null) ?? 'unknown');
      }
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        status: r.status as string,
        role: r.role as string,
        amount: r.amount != null ? Number(r.amount) : null,
        counterparty: cpMap.get(r.counterparty_id as string) ?? 'unknown',
        pickup: (r.pickup_address as string | null) ?? null,
        dropoff: (r.dropoff_address as string | null) ?? null,
        created_at: (r.created_at as Date).toISOString(),
      }));
    } },
    Render: ({ value }) => {
      const items = (value as { id: string; status: string; role: string; amount: number | null; counterparty: string; pickup: string | null; dropoff: string | null; created_at: string }[]) ?? [];
      return (
        <FieldList
          label="Recent rides (last 20)"
          items={items}
          emptyText="No rides yet."
          renderRow={(r) => (
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] uppercase px-1.5 py-0.5 rounded"
                    style={{
                      background: `${STATUS_COLOR[r.status] ?? 'var(--admin-text-muted)'}1f`,
                      color: STATUS_COLOR[r.status] ?? 'var(--admin-text-muted)',
                    }}
                  >
                    {r.status}
                  </span>
                  <span style={{ color: 'var(--admin-text-muted)' }}>
                    as {r.role} · with {r.counterparty}
                  </span>
                </div>
                {(r.pickup || r.dropoff) && (
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--admin-text-muted)' }}>
                    {(r.pickup ?? '?')} → {(r.dropoff ?? '?')}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {r.amount != null && (
                  <div className="text-xs font-medium" style={{ color: 'var(--admin-text)' }}>
                    {fmtCurrency(r.amount)}
                  </div>
                )}
                <div className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                  {fmtDate(r.created_at)}
                </div>
              </div>
            </div>
          )}
        />
      );
    },
  },
  {
    key: 'collection.recent_disputes',
    label: 'Recent disputes (last 5)',
    category: 'Activity',
    applies_to: ['any'],
    render: 'list',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'collection', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const rows = await sql`
        SELECT DISTINCT ON (d.id)
          d.id, d.status, d.reason, d.created_at,
          (d.filed_by = ${ctx.userId}) AS filed_by_self
        FROM disputes d
        LEFT JOIN rides r ON r.id = d.ride_id
        WHERE d.filed_by = ${ctx.userId} OR r.driver_id = ${ctx.userId} OR r.rider_id = ${ctx.userId}
        ORDER BY d.id, d.created_at DESC
        LIMIT 5`;
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        status: r.status as string,
        reason: r.reason as string,
        filed_by_self: Boolean(r.filed_by_self),
        created_at: (r.created_at as Date).toISOString(),
      }));
    } },
    Render: ({ value }) => {
      const items = (value as { id: string; status: string; reason: string; filed_by_self: boolean; created_at: string }[]) ?? [];
      return (
        <FieldList
          label="Recent disputes"
          items={items}
          emptyText="No disputes."
          renderRow={(d) => (
            <div className="flex items-start justify-between gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[10px] uppercase px-1.5 py-0.5 rounded"
                    style={{
                      background: d.status === 'open' ? 'rgba(248, 113, 113, 0.15)' : 'var(--admin-bg-elevated)',
                      color: d.status === 'open' ? '#f87171' : 'var(--admin-text-muted)',
                    }}
                  >
                    {d.status}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                    {d.filed_by_self ? 'filed by them' : 'filed against'}
                  </span>
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--admin-text)' }} title={d.reason}>
                  {d.reason}
                </div>
              </div>
              <div className="text-[10px] shrink-0" style={{ color: 'var(--admin-text-muted)' }}>
                {fmtDate(d.created_at)}
              </div>
            </div>
          )}
        />
      );
    },
  },
];
