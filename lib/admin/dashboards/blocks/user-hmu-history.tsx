// Block: user.hmu_history
//
// Driver→rider HMU/Link history. Status counts split by direction (sent if
// driver, received if rider). Cross-market activity.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';
import { BlockShell, EmptyState, StatGrid } from './_shell';

const configSchema = z.object({}).strict();
type Config = z.infer<typeof configSchema>;

interface DirectionCounts {
  total: number;
  pending: number;
  linked: number;
  dismissed: number;
  unlinked: number;
  expired: number;
}

interface HmuHistoryData {
  has_sent: boolean;
  has_received: boolean;
  sent: DirectionCounts;
  received: DirectionCounts;
}

const STATUSES = ['pending', 'linked', 'dismissed', 'unlinked', 'expired'] as const;

function summarize(rows: { status: string; count: number }[]): DirectionCounts {
  const out: DirectionCounts = { total: 0, pending: 0, linked: 0, dismissed: 0, unlinked: 0, expired: 0 };
  for (const r of rows) {
    out.total += r.count;
    if (STATUSES.includes(r.status as typeof STATUSES[number])) {
      out[r.status as typeof STATUSES[number]] += r.count;
    }
  }
  return out;
}

async function fetchHmuHistory(ctx: BlockFetchContext): Promise<HmuHistoryData> {
  if (!ctx.userId) throw new Error('user.hmu_history requires userId');

  const marketFilter = ctx.marketIds && ctx.marketIds.length > 0;

  const sentRows = marketFilter
    ? await sql`
        SELECT status, COUNT(*)::int AS count
        FROM driver_to_rider_hmus
        WHERE driver_id = ${ctx.userId}
          AND market_id = ANY(${ctx.marketIds}::uuid[])
        GROUP BY status
      `
    : await sql`
        SELECT status, COUNT(*)::int AS count
        FROM driver_to_rider_hmus
        WHERE driver_id = ${ctx.userId}
        GROUP BY status
      `;

  const receivedRows = marketFilter
    ? await sql`
        SELECT status, COUNT(*)::int AS count
        FROM driver_to_rider_hmus
        WHERE rider_id = ${ctx.userId}
          AND market_id = ANY(${ctx.marketIds}::uuid[])
        GROUP BY status
      `
    : await sql`
        SELECT status, COUNT(*)::int AS count
        FROM driver_to_rider_hmus
        WHERE rider_id = ${ctx.userId}
        GROUP BY status
      `;

  const sent = summarize(sentRows.map((r: Record<string, unknown>) => ({ status: r.status as string, count: Number(r.count) })));
  const received = summarize(receivedRows.map((r: Record<string, unknown>) => ({ status: r.status as string, count: Number(r.count) })));

  return {
    has_sent: sent.total > 0,
    has_received: received.total > 0,
    sent,
    received,
  };
}

function Section({ label, counts }: { label: string; counts: DirectionCounts }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--admin-text-muted)' }}>
        {label} · {counts.total}
      </div>
      <StatGrid
        cols={4}
        stats={[
          { label: 'Pending', value: counts.pending },
          { label: 'Linked', value: counts.linked, tone: counts.linked > 0 ? 'good' : undefined },
          { label: 'Dismissed', value: counts.dismissed, tone: counts.dismissed > 3 ? 'bad' : undefined },
          { label: 'Unlinked', value: counts.unlinked },
        ]}
      />
    </div>
  );
}

function HmuHistoryComponent({ data }: { data: HmuHistoryData }) {
  if (!data.has_sent && !data.has_received) {
    return (
      <BlockShell title="HMU history">
        <EmptyState>No HMUs sent or received.</EmptyState>
      </BlockShell>
    );
  }
  return (
    <BlockShell title="HMU history">
      <div className="space-y-3">
        {data.has_sent && <Section label="Sent (as driver)" counts={data.sent} />}
        {data.has_received && <Section label="Received (as rider)" counts={data.received} />}
      </div>
    </BlockShell>
  );
}

export const userHmuHistoryBlock: BlockDefinition<Config, HmuHistoryData> = {
  key: 'user.hmu_history',
  label: 'HMU history',
  description: 'Status counts for driver→rider HMUs sent and received.',
  scope: 'user',
  marketAware: true,
  marketScope: 'admin_all_allowed',
  configSchema,
  defaultConfig: {},
  fetch: (ctx) => fetchHmuHistory(ctx),
  Component: HmuHistoryComponent,
};
