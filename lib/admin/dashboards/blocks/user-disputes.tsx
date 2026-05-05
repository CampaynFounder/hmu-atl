// Block: user.disputes
//
// Open vs resolved counts + the last 5 disputes involving this user (as filer
// or via a ride). Cross-market activity.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';
import { BlockShell, EmptyState, Pill, StatGrid } from './_shell';

const configSchema = z.object({
  recent_limit: z.number().int().min(1).max(20).default(5),
}).strict();
type Config = z.infer<typeof configSchema>;

interface DisputeRow {
  id: string;
  ride_id: string;
  status: string;
  reason: string;
  filed_by_self: boolean;
  created_at: string;
  resolved_at: string | null;
}

interface DisputesData {
  open: number;
  under_review: number;
  resolved: number;
  closed: number;
  recent: DisputeRow[];
}

async function fetchDisputes(ctx: BlockFetchContext, config: Config): Promise<DisputesData> {
  if (!ctx.userId) throw new Error('user.disputes requires userId');

  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE d.status = 'open')::int AS open,
      COUNT(*) FILTER (WHERE d.status = 'under_review')::int AS under_review,
      COUNT(*) FILTER (WHERE d.status = 'resolved')::int AS resolved,
      COUNT(*) FILTER (WHERE d.status = 'closed')::int AS closed
    FROM disputes d
    LEFT JOIN rides r ON r.id = d.ride_id
    WHERE d.filed_by = ${ctx.userId}
       OR r.driver_id = ${ctx.userId}
       OR r.rider_id = ${ctx.userId}
  `;

  const recent = await sql`
    SELECT DISTINCT ON (d.id)
      d.id, d.ride_id, d.status, d.reason,
      (d.filed_by = ${ctx.userId}) AS filed_by_self,
      d.created_at, d.resolved_at
    FROM disputes d
    LEFT JOIN rides r ON r.id = d.ride_id
    WHERE d.filed_by = ${ctx.userId}
       OR r.driver_id = ${ctx.userId}
       OR r.rider_id = ${ctx.userId}
    ORDER BY d.id, d.created_at DESC
    LIMIT ${config.recent_limit}
  `;

  return {
    open: Number(counts.open ?? 0),
    under_review: Number(counts.under_review ?? 0),
    resolved: Number(counts.resolved ?? 0),
    closed: Number(counts.closed ?? 0),
    recent: recent.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      ride_id: r.ride_id as string,
      status: r.status as string,
      reason: r.reason as string,
      filed_by_self: Boolean(r.filed_by_self),
      created_at: (r.created_at as Date).toISOString(),
      resolved_at: r.resolved_at ? (r.resolved_at as Date).toISOString() : null,
    })),
  };
}

const STATUS_COLOR: Record<string, string> = {
  open: '#f87171',
  under_review: '#f59e0b',
  resolved: '#4ade80',
  closed: 'var(--admin-text-muted)',
};

function DisputesComponent({ data }: { data: DisputesData }) {
  const total = data.open + data.under_review + data.resolved + data.closed;
  if (total === 0) {
    return (
      <BlockShell title="Disputes">
        <EmptyState>No disputes.</EmptyState>
      </BlockShell>
    );
  }
  return (
    <BlockShell title="Disputes" subtitle={`${total} total`}>
      <StatGrid
        cols={4}
        stats={[
          { label: 'Open', value: data.open, tone: data.open > 0 ? 'bad' : undefined },
          { label: 'Review', value: data.under_review, tone: data.under_review > 0 ? 'bad' : undefined },
          { label: 'Resolved', value: data.resolved },
          { label: 'Closed', value: data.closed },
        ]}
      />

      {data.recent.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {data.recent.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-2 text-xs py-1.5 border-b last:border-0"
              style={{ borderColor: 'var(--admin-border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill color={STATUS_COLOR[r.status]}>{r.status.replace('_', ' ')}</Pill>
                  <span className="text-[10px]" style={{ color: 'var(--admin-text-muted)' }}>
                    {r.filed_by_self ? 'filed by them' : 'filed against'}
                  </span>
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--admin-text)' }} title={r.reason}>
                  {r.reason}
                </div>
              </div>
              <div className="text-[10px] shrink-0" style={{ color: 'var(--admin-text-muted)' }}>
                {new Date(r.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </BlockShell>
  );
}

export const userDisputesBlock: BlockDefinition<Config, DisputesData> = {
  key: 'user.disputes',
  label: 'Disputes',
  description: 'Open vs resolved counts plus the last few disputes involving this user.',
  scope: 'user',
  marketAware: true,
  marketScope: 'admin_all_allowed',
  configSchema,
  defaultConfig: { recent_limit: 5 },
  fetch: (ctx, config) => fetchDisputes(ctx, config),
  Component: DisputesComponent,
};
