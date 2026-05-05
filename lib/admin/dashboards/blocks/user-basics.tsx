// Block: user.basics
//
// Identity + status snapshot. Always-on for the default-user-profile builtin
// dashboard. Pulled from users + the profile table for the user's profile_type.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';

const configSchema = z.object({}).strict();
type Config = z.infer<typeof configSchema>;

interface BasicsData {
  id: string;
  profile_type: 'rider' | 'driver' | 'admin';
  display_name: string | null;
  handle: string | null;
  account_status: string;
  tier: string | null;
  og_status: boolean;
  chill_score: number;
  completed_rides: number;
  dispute_count: number;
  market_label: string | null;
  created_at: string;
}

async function fetchBasics(ctx: BlockFetchContext): Promise<BasicsData> {
  if (!ctx.userId) throw new Error('user.basics requires userId');

  const rows = await sql`
    SELECT
      u.id,
      u.profile_type,
      u.account_status,
      u.tier,
      COALESCE(u.og_status, false) AS og_status,
      COALESCE(u.chill_score, 0)::float AS chill_score,
      COALESCE(u.completed_rides, 0) AS completed_rides,
      COALESCE(u.created_at, NOW()) AS created_at,
      m.name AS market_label,
      COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS display_name,
      COALESCE(dp.handle, rp.handle) AS handle,
      (
        SELECT COUNT(DISTINCT d.id)
        FROM disputes d
        LEFT JOIN rides r ON r.id = d.ride_id
        WHERE d.filed_by = u.id OR r.driver_id = u.id OR r.rider_id = u.id
      ) AS dispute_count
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.id = ${ctx.userId}
    LIMIT 1
  `;
  if (!rows.length) throw new Error(`User ${ctx.userId} not found`);

  const r = rows[0];
  return {
    id: r.id as string,
    profile_type: r.profile_type as BasicsData['profile_type'],
    display_name: (r.display_name as string | null) ?? null,
    handle: (r.handle as string | null) ?? null,
    account_status: r.account_status as string,
    tier: (r.tier as string | null) ?? null,
    og_status: r.og_status as boolean,
    chill_score: r.chill_score as number,
    completed_rides: r.completed_rides as number,
    dispute_count: Number(r.dispute_count ?? 0),
    market_label: (r.market_label as string | null) ?? null,
    created_at: (r.created_at as Date).toISOString(),
  };
}

function BasicsComponent({ data }: { data: BasicsData }) {
  const stat = (label: string, value: string | number, tone?: 'good' | 'bad') => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>
        {label}
      </span>
      <span
        className="text-sm font-medium"
        style={{
          color: tone === 'bad' ? '#f87171' : tone === 'good' ? '#4ade80' : 'var(--admin-text)',
        }}
      >
        {value}
      </span>
    </div>
  );

  const name = data.display_name || data.handle || 'Unnamed';
  const since = new Date(data.created_at).toLocaleDateString();

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'var(--admin-bg-elevated)',
        border: '1px solid var(--admin-border)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <div className="text-base font-semibold" style={{ color: 'var(--admin-text)' }}>
            {name}
            {data.handle && (
              <span className="ml-2 text-xs" style={{ color: 'var(--admin-text-muted)' }}>
                @{data.handle}
              </span>
            )}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>
            {data.profile_type} · {data.market_label ?? 'no market'} · since {since}
          </div>
        </div>
        <span
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
          style={{
            background:
              data.account_status === 'active' ? 'rgba(74, 222, 128, 0.12)' :
              data.account_status === 'suspended' ? 'rgba(248, 113, 113, 0.12)' :
              'var(--admin-bg)',
            color:
              data.account_status === 'active' ? '#4ade80' :
              data.account_status === 'suspended' ? '#f87171' :
              'var(--admin-text-muted)',
            border: '1px solid var(--admin-border)',
          }}
        >
          {data.account_status}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stat('Tier', data.tier ?? '—')}
        {stat('Chill score', data.chill_score.toFixed(1))}
        {stat('Completed rides', data.completed_rides)}
        {stat(
          'Disputes',
          data.dispute_count,
          data.dispute_count > 0 ? 'bad' : undefined,
        )}
      </div>

      {data.og_status && (
        <div className="mt-3 text-[11px] inline-flex items-center gap-1 px-2 py-0.5 rounded"
          style={{ background: 'rgba(250, 204, 21, 0.12)', color: '#facc15', border: '1px solid var(--admin-border)' }}>
          🔥 OG
        </div>
      )}
    </div>
  );
}

export const userBasicsBlock: BlockDefinition<Config, BasicsData> = {
  key: 'user.basics',
  label: 'User basics',
  description: 'Identity, account status, tier, chill score, completed rides, dispute count.',
  scope: 'user',
  marketAware: false,
  configSchema,
  defaultConfig: {},
  fetch: (ctx) => fetchBasics(ctx),
  Component: BasicsComponent,
};
