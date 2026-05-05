// Block: user.rider_areas
//
// Where this rider needs rides: home_area_slug from rider_profiles plus
// recent pickup / dropoff areas mined from their hmu_posts. Empty state for
// non-rider profile types.
//
// marketScope: 'viewed_user' — areas belong to one market.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';

const configSchema = z.object({
  // How many recent posts to mine for area frequency. 20 is enough to spot
  // habitual pickup/dropoff pairs without dragging in stale signal.
  recent_post_limit: z.number().int().min(1).max(100).default(20),
}).strict();
type Config = z.infer<typeof configSchema>;

interface AreaTally {
  slug: string;
  name: string;
  cardinal: string;
  pickup_count: number;
  dropoff_count: number;
}

interface RiderAreasData {
  is_rider: boolean;
  market_label: string | null;
  home_area: { slug: string; name: string; cardinal: string } | null;
  recent: AreaTally[];
}

async function fetchRiderAreas(ctx: BlockFetchContext, config: Config): Promise<RiderAreasData> {
  if (!ctx.userId) throw new Error('user.rider_areas requires userId');

  const baseRows = await sql`
    SELECT
      u.profile_type,
      m.name AS market_label,
      rp.home_area_slug
    FROM users u
    LEFT JOIN rider_profiles rp ON rp.user_id = u.id
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.id = ${ctx.userId}
    LIMIT 1
  `;
  if (!baseRows.length) throw new Error(`User ${ctx.userId} not found`);
  const base = baseRows[0];
  const isRider = base.profile_type === 'rider';

  if (!isRider || !ctx.marketIds || ctx.marketIds.length === 0) {
    return {
      is_rider: isRider,
      market_label: (base.market_label as string | null) ?? null,
      home_area: null,
      recent: [],
    };
  }

  // Fetch home area + recent post tally in parallel.
  const homeSlug = base.home_area_slug as string | null;
  const [homeRows, recentRows] = await Promise.all([
    homeSlug
      ? sql`
          SELECT slug, name, cardinal
          FROM market_areas
          WHERE slug = ${homeSlug}
            AND market_id = ANY(${ctx.marketIds}::uuid[])
            AND is_active = true
          LIMIT 1
        `
      : Promise.resolve([] as Record<string, unknown>[]),
    sql`
      WITH recent_posts AS (
        SELECT pickup_area_slug, dropoff_area_slug
        FROM hmu_posts
        WHERE user_id = ${ctx.userId}
          AND post_type = 'rider_seeking_driver'
        ORDER BY created_at DESC
        LIMIT ${config.recent_post_limit}
      ),
      tallied AS (
        SELECT slug, SUM(pickup) AS pickup_count, SUM(dropoff) AS dropoff_count
        FROM (
          SELECT pickup_area_slug AS slug, 1 AS pickup, 0 AS dropoff
          FROM recent_posts WHERE pickup_area_slug IS NOT NULL
          UNION ALL
          SELECT dropoff_area_slug AS slug, 0 AS pickup, 1 AS dropoff
          FROM recent_posts WHERE dropoff_area_slug IS NOT NULL
        ) s
        GROUP BY slug
      )
      SELECT t.slug, ma.name, ma.cardinal, t.pickup_count, t.dropoff_count
      FROM tallied t
      JOIN market_areas ma ON ma.slug = t.slug AND ma.market_id = ANY(${ctx.marketIds}::uuid[])
      WHERE ma.is_active = true
      ORDER BY (t.pickup_count + t.dropoff_count) DESC, ma.sort_order ASC
      LIMIT 12
    `,
  ]);

  const home = homeRows.length
    ? {
        slug: homeRows[0].slug as string,
        name: homeRows[0].name as string,
        cardinal: homeRows[0].cardinal as string,
      }
    : null;

  const recent: AreaTally[] = recentRows.map((r: Record<string, unknown>) => ({
    slug: r.slug as string,
    name: r.name as string,
    cardinal: r.cardinal as string,
    pickup_count: Number(r.pickup_count ?? 0),
    dropoff_count: Number(r.dropoff_count ?? 0),
  }));

  return {
    is_rider: isRider,
    market_label: (base.market_label as string | null) ?? null,
    home_area: home,
    recent,
  };
}

function RiderAreasComponent({ data }: { data: RiderAreasData }) {
  if (!data.is_rider) {
    return (
      <BlockShell title="Rider areas">
        <span className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
          Not a rider — no ride areas.
        </span>
      </BlockShell>
    );
  }

  const hasAnything = data.home_area || data.recent.length > 0;

  return (
    <BlockShell
      title="Rider areas"
      subtitle={data.market_label ? `Active in ${data.market_label}` : null}
    >
      {!hasAnything && (
        <span className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
          No home area set and no posts yet.
        </span>
      )}

      {data.home_area && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--admin-text-muted)' }}>
            Home area
          </div>
          <span
            className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1"
            style={{
              background: 'rgba(96, 165, 250, 0.12)',
              color: '#60a5fa',
              border: '1px solid var(--admin-border)',
            }}
            title={data.home_area.cardinal}
          >
            🏠 {data.home_area.name}
          </span>
        </div>
      )}

      {data.recent.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--admin-text-muted)' }}>
            From recent posts
          </div>
          <div className="space-y-1">
            {data.recent.map((a) => (
              <div key={a.slug} className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--admin-text)' }}>{a.name}</span>
                <span style={{ color: 'var(--admin-text-muted)' }}>
                  {a.pickup_count > 0 && <span title="pickups">↑{a.pickup_count}</span>}
                  {a.pickup_count > 0 && a.dropoff_count > 0 && <span> · </span>}
                  {a.dropoff_count > 0 && <span title="dropoffs">↓{a.dropoff_count}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </BlockShell>
  );
}

function BlockShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'var(--admin-bg-elevated)',
        border: '1px solid var(--admin-border)',
      }}
    >
      <div className="mb-3">
        <div className="text-sm font-semibold" style={{ color: 'var(--admin-text)' }}>{title}</div>
        {subtitle && (
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--admin-text-muted)' }}>{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export const userRiderAreasBlock: BlockDefinition<Config, RiderAreasData> = {
  key: 'user.rider_areas',
  label: 'Rider areas',
  description: 'Home area plus pickup/dropoff areas mined from the rider\'s recent posts.',
  scope: 'user',
  marketAware: true,
  marketScope: 'viewed_user',
  configSchema,
  defaultConfig: { recent_post_limit: 20 },
  fetch: (ctx, config) => fetchRiderAreas(ctx, config),
  Component: RiderAreasComponent,
};
