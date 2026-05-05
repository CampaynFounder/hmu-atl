// HMU/Link directional aggregates. Cross-market via admin_all_allowed.

import type { FieldDefinition } from './types';
import { StatTile, toneForCount } from './renderers';

async function hmuCount(userId: string, role: 'driver' | 'rider', status: string | null, marketIds: string[] | null): Promise<number> {
  const { sql } = await import('@/lib/db/client');
  const userCol = role === 'driver' ? 'driver_id' : 'rider_id';
  const filterByMarket = marketIds && marketIds.length > 0;
  // Build the appropriate query branch — the dynamic-column part is small
  // enough to spell out instead of using sql.unsafe.
  if (role === 'driver') {
    if (status) {
      const [r] = filterByMarket
        ? await sql`SELECT COUNT(*)::int AS v FROM driver_to_rider_hmus WHERE driver_id = ${userId} AND status = ${status} AND market_id = ANY(${marketIds}::uuid[])`
        : await sql`SELECT COUNT(*)::int AS v FROM driver_to_rider_hmus WHERE driver_id = ${userId} AND status = ${status}`;
      return Number(r?.v ?? 0);
    }
    const [r] = filterByMarket
      ? await sql`SELECT COUNT(*)::int AS v FROM driver_to_rider_hmus WHERE driver_id = ${userId} AND market_id = ANY(${marketIds}::uuid[])`
      : await sql`SELECT COUNT(*)::int AS v FROM driver_to_rider_hmus WHERE driver_id = ${userId}`;
    return Number(r?.v ?? 0);
  }
  if (status) {
    const [r] = filterByMarket
      ? await sql`SELECT COUNT(*)::int AS v FROM driver_to_rider_hmus WHERE rider_id = ${userId} AND status = ${status} AND market_id = ANY(${marketIds}::uuid[])`
      : await sql`SELECT COUNT(*)::int AS v FROM driver_to_rider_hmus WHERE rider_id = ${userId} AND status = ${status}`;
    return Number(r?.v ?? 0);
  }
  const [r] = filterByMarket
    ? await sql`SELECT COUNT(*)::int AS v FROM driver_to_rider_hmus WHERE rider_id = ${userId} AND market_id = ANY(${marketIds}::uuid[])`
    : await sql`SELECT COUNT(*)::int AS v FROM driver_to_rider_hmus WHERE rider_id = ${userId}`;
  return Number(r?.v ?? 0);
}

export const hmuFields: FieldDefinition[] = [
  {
    key: 'aggregate.hmus_sent_total',
    label: 'HMUs sent (total)',
    category: 'HMU',
    applies_to: ['driver'],
    render: 'stat',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'aggregate', fetch: (ctx) => hmuCount(ctx.userId!, 'driver', null, ctx.marketIds) },
    Render: ({ value }) => <StatTile label="HMUs sent" value={Number(value ?? 0)} />,
  },
  {
    key: 'aggregate.hmus_sent_linked',
    label: 'HMUs sent · linked',
    category: 'HMU',
    applies_to: ['driver'],
    render: 'stat',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'aggregate', fetch: (ctx) => hmuCount(ctx.userId!, 'driver', 'linked', ctx.marketIds) },
    Render: ({ value }) => {
      const n = Number(value ?? 0);
      return <StatTile label="Linked" value={n} tone={n > 0 ? 'good' : undefined} />;
    },
  },
  {
    key: 'aggregate.hmus_sent_dismissed',
    label: 'HMUs sent · dismissed',
    category: 'HMU',
    applies_to: ['driver'],
    render: 'stat',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'aggregate', fetch: (ctx) => hmuCount(ctx.userId!, 'driver', 'dismissed', ctx.marketIds) },
    Render: ({ value }) => {
      const n = Number(value ?? 0);
      return <StatTile label="Dismissed" value={n} tone={toneForCount(n, 5, 3)} />;
    },
  },
  {
    key: 'aggregate.hmus_received_total',
    label: 'HMUs received (total)',
    category: 'HMU',
    applies_to: ['rider'],
    render: 'stat',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'aggregate', fetch: (ctx) => hmuCount(ctx.userId!, 'rider', null, ctx.marketIds) },
    Render: ({ value }) => <StatTile label="HMUs received" value={Number(value ?? 0)} />,
  },
  {
    key: 'aggregate.hmus_received_linked',
    label: 'HMUs received · linked',
    category: 'HMU',
    applies_to: ['rider'],
    render: 'stat',
    marketAware: true,
    marketScope: 'admin_all_allowed',
    source: { kind: 'aggregate', fetch: (ctx) => hmuCount(ctx.userId!, 'rider', 'linked', ctx.marketIds) },
    Render: ({ value }) => {
      const n = Number(value ?? 0);
      return <StatTile label="Linked" value={n} tone={n > 0 ? 'good' : undefined} />;
    },
  },
];
