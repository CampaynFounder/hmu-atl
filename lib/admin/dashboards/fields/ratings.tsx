// Rating signal fields. Aggregates from `ratings` table where this user was rated.

import type { FieldDefinition } from './types';
import { StatTile, toneForCount } from './renderers';

async function ratingCount(userId: string, type: string): Promise<number> {
  const { sql } = await import('@/lib/db/client');
  const [r] = await sql`
    SELECT COUNT(*)::int AS v FROM ratings WHERE rated_id = ${userId} AND rating_type = ${type}`;
  return Number(r?.v ?? 0);
}

export const ratingFields: FieldDefinition[] = [
  {
    key: 'aggregate.ratings_total',
    label: 'Ratings (total)',
    category: 'Ratings',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`SELECT COUNT(*)::int AS v FROM ratings WHERE rated_id = ${ctx.userId}`;
      return Number(r?.v ?? 0);
    } },
    Render: ({ value }) => <StatTile label="Ratings total" value={Number(value ?? 0)} />,
  },
  {
    key: 'aggregate.rating_chill',
    label: 'CHILL ✅',
    category: 'Ratings',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: (ctx) => ratingCount(ctx.userId!, 'chill') },
    Render: ({ value }) => <StatTile label="CHILL ✅" value={Number(value ?? 0)} tone="good" />,
  },
  {
    key: 'aggregate.rating_cool_af',
    label: 'Cool AF 😎',
    category: 'Ratings',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: (ctx) => ratingCount(ctx.userId!, 'cool_af') },
    Render: ({ value }) => <StatTile label="Cool AF 😎" value={Number(value ?? 0)} tone="good" />,
  },
  {
    key: 'aggregate.rating_kinda_creepy',
    label: 'Kinda Creepy 👀',
    category: 'Ratings',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: (ctx) => ratingCount(ctx.userId!, 'kinda_creepy') },
    Render: ({ value }) => {
      const n = Number(value ?? 0);
      return <StatTile label="Kinda Creepy 👀" value={n} tone={toneForCount(n, 3, 1)} />;
    },
  },
  {
    key: 'aggregate.rating_weirdo',
    label: 'WEIRDO 🚩',
    category: 'Ratings',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: (ctx) => ratingCount(ctx.userId!, 'weirdo') },
    Render: ({ value }) => {
      const n = Number(value ?? 0);
      return <StatTile label="WEIRDO 🚩" value={n} tone={toneForCount(n, 1, 0)} />;
    },
  },
];
