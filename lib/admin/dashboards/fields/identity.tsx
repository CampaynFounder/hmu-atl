// Fields about WHO this user is — identity, status, tier, lifetime totals.
// All sourced from `users` and the profile tables.

import type { FieldDefinition } from './types';
import { BadgeChip, FlagChip, StatTile, fmtDate } from './renderers';

const STATUS_COLOR: Record<string, string> = {
  active: '#4ade80',
  pending_activation: '#f59e0b',
  suspended: '#f87171',
  banned: '#dc2626',
};

const TIER_COLOR: Record<string, string> = {
  free: 'var(--admin-text-muted)',
  hmu_first: '#60a5fa',
};

export const identityFields: FieldDefinition[] = [
  {
    key: 'users.display_name',
    label: 'Display name',
    category: 'Identity',
    description: 'Preferred display name from profile.',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`
        SELECT COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS v
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.id = ${ctx.userId} LIMIT 1`;
      return (r?.v as string | null) ?? null;
    } },
    Render: ({ value }) => <StatTile label="Display name" value={value as string | null} />,
  },
  {
    key: 'users.handle',
    label: 'Handle',
    category: 'Identity',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`
        SELECT COALESCE(dp.handle, rp.handle) AS v
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.id = ${ctx.userId} LIMIT 1`;
      const h = r?.v as string | null;
      return h ? `@${h}` : null;
    } },
    Render: ({ value }) => <StatTile label="Handle" value={value as string | null} />,
  },
  {
    key: 'users.profile_type',
    label: 'Profile type',
    category: 'Identity',
    applies_to: ['any'],
    render: 'badge',
    source: { kind: 'user_column', column: 'profile_type' },
    Render: ({ value }) => <BadgeChip label="Profile type" value={value as string | null} color="#60a5fa" />,
  },
  {
    key: 'users.account_status',
    label: 'Account status',
    category: 'Identity',
    applies_to: ['any'],
    render: 'badge',
    source: { kind: 'user_column', column: 'account_status' },
    Render: ({ value }) => {
      const v = value as string | null;
      return <BadgeChip label="Status" value={v} color={v ? STATUS_COLOR[v] : undefined} />;
    },
  },
  {
    key: 'users.tier',
    label: 'Tier',
    category: 'Identity',
    description: 'Free or HMU First subscription tier.',
    applies_to: ['driver'],
    render: 'badge',
    source: { kind: 'user_column', column: 'tier' },
    Render: ({ value }) => {
      const v = value as string | null;
      return <BadgeChip label="Tier" value={v} color={v ? TIER_COLOR[v] : undefined} />;
    },
  },
  {
    key: 'users.og_status',
    label: 'OG status',
    category: 'Identity',
    description: 'Rider perk: 10+ rides, 0 open disputes.',
    applies_to: ['rider'],
    render: 'flag',
    source: { kind: 'user_column', column: 'og_status' },
    Render: ({ value }) => <FlagChip label="OG" active={Boolean(value)} activeText="🔥 OG" color="#facc15" />,
  },
  {
    key: 'users.chill_score',
    label: 'Chill score',
    category: 'Identity',
    description: 'Computed score from ratings (0–100).',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'user_column', column: 'chill_score', cast: 'float' },
    Render: ({ value }) => {
      const n = value as number | null;
      return <StatTile label="Chill score" value={n != null ? Number(n).toFixed(1) : '—'} />;
    },
  },
  {
    key: 'users.completed_rides',
    label: 'Completed rides',
    category: 'Identity',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'user_column', column: 'completed_rides' },
    Render: ({ value }) => <StatTile label="Completed rides" value={Number(value ?? 0)} />,
  },
  {
    key: 'users.created_at',
    label: 'Member since',
    category: 'Identity',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'user_column', column: 'created_at' },
    Render: ({ value }) => <StatTile label="Member since" value={fmtDate(value as string | null)} />,
  },
  {
    key: 'users.market',
    label: 'Market',
    category: 'Identity',
    description: "User's home market (joined to markets table).",
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`SELECT m.name AS v FROM users u LEFT JOIN markets m ON m.id = u.market_id WHERE u.id = ${ctx.userId} LIMIT 1`;
      return (r?.v as string | null) ?? null;
    } },
    Render: ({ value }) => <StatTile label="Market" value={(value as string) ?? '—'} />,
  },
  {
    key: 'users.phone',
    label: 'Phone',
    category: 'Identity',
    applies_to: ['any'],
    render: 'stat',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      const [r] = await sql`
        SELECT COALESCE(u.phone, dp.phone, rp.phone) AS v
        FROM users u
        LEFT JOIN driver_profiles dp ON dp.user_id = u.id
        LEFT JOIN rider_profiles rp ON rp.user_id = u.id
        WHERE u.id = ${ctx.userId} LIMIT 1`;
      return (r?.v as string | null) ?? null;
    } },
    Render: ({ value }) => <StatTile label="Phone" value={(value as string) ?? '—'} />,
  },
];
