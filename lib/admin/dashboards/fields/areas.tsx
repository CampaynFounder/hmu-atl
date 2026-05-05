// Areas — where this user wants to drive (driver) or ride (rider). All
// scoped to the viewed user's market via marketScope: 'viewed_user'.

import type { FieldDefinition } from './types';
import { ChipRow, FlagChip } from './renderers';

export const areaFields: FieldDefinition[] = [
  {
    key: 'driver.area_slugs',
    label: 'Driver areas',
    category: 'Areas',
    description: 'Areas this driver is willing to drive (joined to market_areas labels).',
    applies_to: ['driver'],
    render: 'list',
    marketAware: true,
    marketScope: 'viewed_user',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      if (!ctx.marketIds || ctx.marketIds.length === 0) return [];
      const profileRows = await sql`SELECT area_slugs FROM driver_profiles WHERE user_id = ${ctx.userId} LIMIT 1`;
      const slugs = (profileRows[0]?.area_slugs as string[] | null) ?? [];
      if (slugs.length === 0) return [];
      const rows = await sql`
        SELECT slug, name, cardinal
        FROM market_areas
        WHERE market_id = ANY(${ctx.marketIds}::uuid[])
          AND slug = ANY(${slugs}::text[])
          AND is_active = true
        ORDER BY sort_order ASC, name ASC`;
      return rows.map((r: Record<string, unknown>) => ({
        slug: r.slug as string,
        name: r.name as string,
        cardinal: r.cardinal as string,
      }));
    } },
    Render: ({ value }) => {
      const items = (value as { slug: string; name: string; cardinal: string }[]) ?? [];
      return (
        <ChipRow
          label="Driver areas"
          chips={items.map((a) => ({ text: a.name, title: `${a.cardinal} · ${a.slug}` }))}
          emptyText="No areas selected."
        />
      );
    },
  },
  {
    key: 'driver.services_entire_market',
    label: 'Services entire market',
    category: 'Areas',
    applies_to: ['driver'],
    render: 'flag',
    source: { kind: 'driver_column', column: 'services_entire_market' },
    Render: ({ value }) => (
      <FlagChip label="Services entire market" active={Boolean(value)} activeText="yes" color="#4ade80" />
    ),
  },
  {
    key: 'driver.accepts_long_distance',
    label: 'Accepts long distance',
    category: 'Areas',
    applies_to: ['driver'],
    render: 'flag',
    source: { kind: 'driver_column', column: 'accepts_long_distance' },
    Render: ({ value }) => (
      <FlagChip label="Long distance" active={Boolean(value)} activeText="yes" color="#60a5fa" />
    ),
  },
  {
    key: 'rider.home_area',
    label: 'Rider home area',
    category: 'Areas',
    description: "Rider's saved home area (joined to market_areas).",
    applies_to: ['rider'],
    render: 'list',
    marketAware: true,
    marketScope: 'viewed_user',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      if (!ctx.marketIds || ctx.marketIds.length === 0) return null;
      const [profile] = await sql`SELECT home_area_slug AS s FROM rider_profiles WHERE user_id = ${ctx.userId} LIMIT 1`;
      const slug = profile?.s as string | null;
      if (!slug) return null;
      const [r] = await sql`
        SELECT slug, name, cardinal FROM market_areas
        WHERE slug = ${slug} AND market_id = ANY(${ctx.marketIds}::uuid[]) AND is_active = true
        LIMIT 1`;
      return r ? { slug: r.slug as string, name: r.name as string, cardinal: r.cardinal as string } : null;
    } },
    Render: ({ value }) => {
      const v = value as { slug: string; name: string; cardinal: string } | null;
      return (
        <ChipRow
          label="Home area"
          chips={v ? [{ text: `🏠 ${v.name}`, title: v.cardinal, color: '#60a5fa' }] : []}
          emptyText="No home area set."
        />
      );
    },
  },
  {
    key: 'rider.recent_post_areas',
    label: 'Recent ride areas',
    category: 'Areas',
    description: "Pickup/dropoff areas from this rider's recent posts (last 20).",
    applies_to: ['rider'],
    render: 'list',
    marketAware: true,
    marketScope: 'viewed_user',
    source: { kind: 'aggregate', fetch: async (ctx) => {
      const { sql } = await import('@/lib/db/client');
      if (!ctx.marketIds || ctx.marketIds.length === 0) return [];
      const rows = await sql`
        WITH recent_posts AS (
          SELECT pickup_area_slug, dropoff_area_slug
          FROM hmu_posts
          WHERE user_id = ${ctx.userId} AND post_type = 'rider_seeking_driver'
          ORDER BY created_at DESC LIMIT 20
        ),
        tallied AS (
          SELECT slug, SUM(pickup) AS pickup_count, SUM(dropoff) AS dropoff_count
          FROM (
            SELECT pickup_area_slug AS slug, 1 AS pickup, 0 AS dropoff FROM recent_posts WHERE pickup_area_slug IS NOT NULL
            UNION ALL
            SELECT dropoff_area_slug AS slug, 0 AS pickup, 1 AS dropoff FROM recent_posts WHERE dropoff_area_slug IS NOT NULL
          ) s GROUP BY slug
        )
        SELECT t.slug, ma.name, ma.cardinal, t.pickup_count, t.dropoff_count
        FROM tallied t
        JOIN market_areas ma ON ma.slug = t.slug AND ma.market_id = ANY(${ctx.marketIds}::uuid[])
        WHERE ma.is_active = true
        ORDER BY (t.pickup_count + t.dropoff_count) DESC, ma.sort_order ASC
        LIMIT 12`;
      return rows.map((r: Record<string, unknown>) => ({
        slug: r.slug as string,
        name: r.name as string,
        cardinal: r.cardinal as string,
        pickup_count: Number(r.pickup_count ?? 0),
        dropoff_count: Number(r.dropoff_count ?? 0),
      }));
    } },
    Render: ({ value }) => {
      const items = (value as { slug: string; name: string; cardinal: string; pickup_count: number; dropoff_count: number }[]) ?? [];
      return (
        <ChipRow
          label="Recent ride areas"
          chips={items.map((a) => ({
            text: `${a.name} ${a.pickup_count > 0 ? `↑${a.pickup_count}` : ''}${a.pickup_count > 0 && a.dropoff_count > 0 ? '·' : ''}${a.dropoff_count > 0 ? `↓${a.dropoff_count}` : ''}`,
            title: a.cardinal,
          }))}
          emptyText="No posts yet."
        />
      );
    },
  },
];
