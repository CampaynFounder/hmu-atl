// Block: user.driver_areas
//
// Where this driver is willing to drive: their area_slugs (joined to
// market_areas for labels), plus the policy flags services_entire_market and
// accepts_long_distance. Empty state for non-driver profile types.
//
// marketScope: 'viewed_user' — areas belong to one market, so we filter
// market_areas to the viewed user's market.

import { z } from 'zod';
import { sql } from '@/lib/db/client';
import type { BlockDefinition, BlockFetchContext } from './types';

const configSchema = z.object({}).strict();
type Config = z.infer<typeof configSchema>;

interface AreaRow {
  slug: string;
  name: string;
  cardinal: string;
}

interface DriverAreasData {
  is_driver: boolean;
  services_entire_market: boolean;
  accepts_long_distance: boolean;
  market_label: string | null;
  areas: AreaRow[];
}

async function fetchDriverAreas(ctx: BlockFetchContext): Promise<DriverAreasData> {
  if (!ctx.userId) throw new Error('user.driver_areas requires userId');

  const profileRows = await sql`
    SELECT
      u.profile_type,
      m.name AS market_label,
      dp.area_slugs,
      COALESCE(dp.services_entire_market, false) AS services_entire_market,
      COALESCE(dp.accepts_long_distance, false) AS accepts_long_distance
    FROM users u
    LEFT JOIN driver_profiles dp ON dp.user_id = u.id
    LEFT JOIN markets m ON m.id = u.market_id
    WHERE u.id = ${ctx.userId}
    LIMIT 1
  `;
  if (!profileRows.length) throw new Error(`User ${ctx.userId} not found`);
  const p = profileRows[0];

  const isDriver = p.profile_type === 'driver';
  const slugs = (p.area_slugs as string[] | null) ?? [];

  // marketIds is resolved by the runtime per marketScope='viewed_user'. We use
  // it to scope the area lookup so a driver who once worked another market
  // doesn't surface stale slugs from there.
  let areas: AreaRow[] = [];
  if (isDriver && slugs.length > 0 && ctx.marketIds && ctx.marketIds.length > 0) {
    const rows = await sql`
      SELECT slug, name, cardinal
      FROM market_areas
      WHERE market_id = ANY(${ctx.marketIds}::uuid[])
        AND slug = ANY(${slugs}::text[])
        AND is_active = true
      ORDER BY sort_order ASC, name ASC
    `;
    areas = rows.map((r: Record<string, unknown>) => ({
      slug: r.slug as string,
      name: r.name as string,
      cardinal: r.cardinal as string,
    }));
  }

  return {
    is_driver: isDriver,
    services_entire_market: p.services_entire_market as boolean,
    accepts_long_distance: p.accepts_long_distance as boolean,
    market_label: (p.market_label as string | null) ?? null,
    areas,
  };
}

function DriverAreasComponent({ data }: { data: DriverAreasData }) {
  if (!data.is_driver) {
    return (
      <BlockShell title="Driver areas">
        <span className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
          Not a driver — no driving areas.
        </span>
      </BlockShell>
    );
  }

  return (
    <BlockShell
      title="Driver areas"
      subtitle={data.market_label ? `Active in ${data.market_label}` : null}
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {data.services_entire_market && <Flag color="#4ade80">Services entire market</Flag>}
        {data.accepts_long_distance && <Flag color="#60a5fa">Accepts long distance</Flag>}
        {!data.services_entire_market && !data.accepts_long_distance && data.areas.length === 0 && (
          <span className="text-xs" style={{ color: 'var(--admin-text-muted)' }}>
            No areas selected.
          </span>
        )}
      </div>

      {data.areas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.areas.map((a) => (
            <span
              key={a.slug}
              className="text-[11px] px-2 py-0.5 rounded"
              style={{
                background: 'var(--admin-bg)',
                color: 'var(--admin-text)',
                border: '1px solid var(--admin-border)',
              }}
              title={`${a.cardinal} · ${a.slug}`}
            >
              {a.name}
            </span>
          ))}
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

function Flag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-1"
      style={{
        background: `${color}1f`,
        color,
        border: '1px solid var(--admin-border)',
      }}
    >
      {children}
    </span>
  );
}

export const userDriverAreasBlock: BlockDefinition<Config, DriverAreasData> = {
  key: 'user.driver_areas',
  label: 'Driver areas',
  description: 'Areas this driver is willing to drive, plus services-entire-market and long-distance flags.',
  scope: 'user',
  marketAware: true,
  marketScope: 'viewed_user',
  configSchema,
  defaultConfig: {},
  fetch: (ctx) => fetchDriverAreas(ctx),
  Component: DriverAreasComponent,
};
