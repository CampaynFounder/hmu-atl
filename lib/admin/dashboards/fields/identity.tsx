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

interface AvatarValue {
  url: string | null;
  initials: string;
}

function buildInitials(name: string | null, handle: string | null): string {
  const src = (name && name.trim()) || (handle && handle.trim()) || '';
  if (!src) return '?';
  const parts = src.replace('@', '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const identityFields: FieldDefinition[] = [
  {
    key: 'users.avatar',
    label: 'Avatar',
    category: 'Identity',
    description: 'Profile picture (riders) or initials fallback. No avatar for drivers yet — falls back to initials.',
    applies_to: ['any'],
    render: 'stat',
    source: {
      kind: 'aggregate',
      // Single-row fallback. fetchUserGridRows uses batchFetch when present.
      fetch: async (ctx) => {
        const { sql } = await import('@/lib/db/client');
        const [r] = await sql`
          SELECT rp.avatar_url AS url,
                 COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS name,
                 COALESCE(dp.handle, rp.handle) AS handle
          FROM users u
          LEFT JOIN driver_profiles dp ON dp.user_id = u.id
          LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
          WHERE u.id = ${ctx.userId} LIMIT 1`;
        return {
          url: (r?.url as string | null) ?? null,
          initials: buildInitials((r?.name as string | null) ?? null, (r?.handle as string | null) ?? null),
        } satisfies AvatarValue;
      },
      // Batched: one SELECT for the whole grid page.
      batchFetch: async (ctx) => {
        const { sql } = await import('@/lib/db/client');
        const rows = await sql`
          SELECT u.id,
                 rp.avatar_url AS url,
                 COALESCE(dp.display_name, dp.first_name, rp.display_name, rp.first_name) AS name,
                 COALESCE(dp.handle, rp.handle) AS handle
          FROM users u
          LEFT JOIN driver_profiles dp ON dp.user_id = u.id
          LEFT JOIN rider_profiles  rp ON rp.user_id = u.id
          WHERE u.id = ANY(${ctx.userIds}::uuid[])`;
        const m = new Map<string, unknown>();
        for (const r of rows as Record<string, unknown>[]) {
          m.set(r.id as string, {
            url: (r.url as string | null) ?? null,
            initials: buildInitials((r.name as string | null) ?? null, (r.handle as string | null) ?? null),
          } satisfies AvatarValue);
        }
        return m;
      },
    },
    Render: ({ value }) => <AvatarBlock value={value as AvatarValue | null} size={56} />,
    Cell: ({ value }) => <AvatarBlock value={value as AvatarValue | null} size={28} />,
  },
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
    key: 'users.profile_link',
    label: 'HMU link',
    category: 'Identity',
    description: 'Public HMU profile (driver only). Opens /d/<handle> in a new tab.',
    applies_to: ['driver'],
    render: 'stat',
    source: {
      kind: 'aggregate',
      fetch: async (ctx) => {
        const { sql } = await import('@/lib/db/client');
        const [r] = await sql`
          SELECT dp.handle AS v
          FROM users u
          LEFT JOIN driver_profiles dp ON dp.user_id = u.id
          WHERE u.id = ${ctx.userId} LIMIT 1`;
        return (r?.v as string | null) ?? null;
      },
      batchFetch: async (ctx) => {
        const { sql } = await import('@/lib/db/client');
        const rows = await sql`
          SELECT u.id, dp.handle AS v
          FROM users u
          LEFT JOIN driver_profiles dp ON dp.user_id = u.id
          WHERE u.id = ANY(${ctx.userIds}::uuid[])`;
        const m = new Map<string, unknown>();
        for (const r of rows as Record<string, unknown>[]) {
          m.set(r.id as string, (r.v as string | null) ?? null);
        }
        return m;
      },
    },
    Render: ({ value }) => <ProfileLink handle={value as string | null} variant="stat" />,
    Cell: ({ value }) => <ProfileLink handle={value as string | null} variant="cell" />,
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

function ProfileLink({ handle, variant }: { handle: string | null; variant: 'cell' | 'stat' }) {
  if (!handle) return <span style={{ color: 'var(--admin-text-muted)' }}>—</span>;
  const href = `/d/${handle}`;
  const text = `@${handle}`;
  // Stop propagation so clicks don't trigger the grid row's window.location.href.
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); };
  if (variant === 'cell') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        style={{ color: '#60a5fa', textDecoration: 'underline' }}
      >
        {text}
      </a>
    );
  }
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: 'var(--admin-bg-elevated)', border: '1px solid var(--admin-border)' }}
    >
      <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--admin-text-muted)' }}>
        HMU link
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        className="text-sm font-semibold"
        style={{ color: '#60a5fa', textDecoration: 'underline' }}
      >
        {text} ↗
      </a>
    </div>
  );
}

function AvatarBlock({ value, size }: { value: AvatarValue | null; size: number }) {
  const url = value?.url ?? null;
  const initials = value?.initials ?? '?';
  const fontSize = Math.max(10, Math.round(size * 0.42));
  if (url) {
    return (
      <span
        className="inline-block rounded-full overflow-hidden"
        style={{ width: size, height: size, background: 'var(--admin-bg)', border: '1px solid var(--admin-border)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold uppercase"
      style={{
        width: size,
        height: size,
        fontSize,
        background: 'rgba(96, 165, 250, 0.12)',
        color: '#60a5fa',
        border: '1px solid var(--admin-border)',
      }}
    >
      {initials}
    </span>
  );
}
