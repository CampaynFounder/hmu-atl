// Block: user.ratings
//
// Counterparty signal: how others rated this user. Breaks down by rating_type
// (chill / cool_af / kinda_creepy / weirdo) and surfaces the computed Chill
// Score so safety/support can spot patterns at a glance.
//
// Not marketAware — ratings carry across markets.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';
import { BlockShell, EmptyState } from './_shell';

const configSchema = z.object({}).strict();
type Config = z.infer<typeof configSchema>;

interface RatingsData {
  total: number;
  chill: number;
  cool_af: number;
  kinda_creepy: number;
  weirdo: number;
  chill_score: number;
}

async function fetchRatings(ctx: BlockFetchContext): Promise<RatingsData> {
  if (!ctx.userId) throw new Error('user.ratings requires userId');

  const [counts] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE rating_type = 'chill')::int AS chill,
      COUNT(*) FILTER (WHERE rating_type = 'cool_af')::int AS cool_af,
      COUNT(*) FILTER (WHERE rating_type = 'kinda_creepy')::int AS kinda_creepy,
      COUNT(*) FILTER (WHERE rating_type = 'weirdo')::int AS weirdo
    FROM ratings
    WHERE rated_id = ${ctx.userId}
  `;

  const [score] = await sql`
    SELECT COALESCE(chill_score, 0)::float AS chill_score FROM users WHERE id = ${ctx.userId} LIMIT 1
  `;

  return {
    total: Number(counts.total ?? 0),
    chill: Number(counts.chill ?? 0),
    cool_af: Number(counts.cool_af ?? 0),
    kinda_creepy: Number(counts.kinda_creepy ?? 0),
    weirdo: Number(counts.weirdo ?? 0),
    chill_score: Number(score?.chill_score ?? 0),
  };
}

function RatingsComponent({ data }: { data: RatingsData }) {
  if (data.total === 0) {
    return (
      <BlockShell title="Ratings">
        <EmptyState>No ratings yet.</EmptyState>
      </BlockShell>
    );
  }

  // Bar percentages relative to total. Width caps at 100% for the visualization.
  const bar = (n: number) => (data.total > 0 ? Math.round((n / data.total) * 100) : 0);

  const rows: { label: string; emoji: string; count: number; color: string }[] = [
    { label: 'CHILL', emoji: '✅', count: data.chill, color: '#4ade80' },
    { label: 'Cool AF', emoji: '😎', count: data.cool_af, color: '#60a5fa' },
    { label: 'Kinda Creepy', emoji: '👀', count: data.kinda_creepy, color: '#f59e0b' },
    { label: 'WEIRDO', emoji: '🚩', count: data.weirdo, color: '#f87171' },
  ];

  const negative = data.kinda_creepy + data.weirdo;
  const negativeBadge = negative >= 3
    ? { tone: '#f87171', text: `⚠ ${negative} negative ratings` }
    : null;

  return (
    <BlockShell
      title="Ratings"
      subtitle={`${data.total} total · Chill score ${data.chill_score.toFixed(1)}`}
    >
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-center justify-between text-[11px] mb-0.5">
              <span style={{ color: 'var(--admin-text)' }}>
                {r.emoji} {r.label}
              </span>
              <span style={{ color: 'var(--admin-text-muted)' }}>{r.count}</span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'var(--admin-bg)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${bar(r.count)}%`,
                  background: r.color,
                  opacity: r.count > 0 ? 1 : 0,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {negativeBadge && (
        <div className="mt-3 text-[11px]" style={{ color: negativeBadge.tone }}>
          {negativeBadge.text}
        </div>
      )}
    </BlockShell>
  );
}

export const userRatingsBlock: BlockDefinition<Config, RatingsData> = {
  key: 'user.ratings',
  label: 'Ratings',
  description: 'Rating breakdown (CHILL / Cool AF / Kinda Creepy / WEIRDO) plus chill score.',
  scope: 'user',
  marketAware: false,
  configSchema,
  defaultConfig: {},
  fetch: (ctx) => fetchRatings(ctx),
  Component: RatingsComponent,
};
