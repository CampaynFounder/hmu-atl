import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, unauthorizedResponse, logAdminAction } from '@/lib/admin/helpers';
import { sql } from '@/lib/db/client';

const CARDINAL_MACROS = [
  { slug: 'central',   name: 'Central',   cardinal: 'central',   sort_order: 100 },
  { slug: 'eastside',  name: 'Eastside',  cardinal: 'eastside',  sort_order: 101 },
  { slug: 'westside',  name: 'Westside',  cardinal: 'westside',  sort_order: 102 },
  { slug: 'northside', name: 'Northside', cardinal: 'northside', sort_order: 103 },
  { slug: 'southside', name: 'Southside', cardinal: 'southside', sort_order: 104 },
] as const;

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorizedResponse();
  if (!admin.is_super) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const {
    slug, name, state, timezone,
    centerLat, centerLng, radiusMiles,
    smsDid, smsAreaCode, areas, branding,
    cloneCmsFrom,
  } = body as Record<string, unknown>;

  if (!slug || !name || !state || !timezone || centerLat == null || centerLng == null || !radiusMiles) {
    return NextResponse.json({ error: 'Missing required fields: slug, name, state, timezone, centerLat, centerLng, radiusMiles' }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(slug as string)) {
    return NextResponse.json({ error: 'Slug must be lowercase alphanumeric with hyphens only' }, { status: 400 });
  }
  if (!Array.isArray(areas) || areas.length === 0) {
    return NextResponse.json({ error: 'At least one neighborhood is required' }, { status: 400 });
  }

  const existing = await sql`SELECT id FROM markets WHERE slug = ${slug as string} LIMIT 1`;
  if (existing.length) {
    return NextResponse.json({ error: `Slug '${slug}' is already taken` }, { status: 409 });
  }

  const inserted = await sql`
    INSERT INTO markets (
      slug, name, subdomain, state, timezone, status,
      center_lat, center_lng, radius_miles,
      sms_did, sms_area_code, min_drivers_to_launch,
      fee_config, launch_offer_config, branding
    ) VALUES (
      ${slug as string}, ${name as string}, ${slug as string},
      ${state as string}, ${timezone as string}, 'setup',
      ${Number(centerLat)}, ${Number(centerLng)}, ${Number(radiusMiles)},
      ${(smsDid as string) ?? null}, ${(smsAreaCode as string) ?? null}, 0,
      '{}'::jsonb, '{}'::jsonb,
      ${JSON.stringify(branding || {})}::jsonb
    )
    RETURNING id, slug, name, status
  `;
  const marketId = inserted[0].id as string;

  const typedAreas = areas as Array<{ slug: string; name: string; cardinal: string; sort_order: number }>;
  for (const area of [...typedAreas, ...CARDINAL_MACROS]) {
    await sql`
      INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
      VALUES (${marketId}, ${area.slug}, ${area.name}, ${area.cardinal}, ${area.sort_order}, true)
      ON CONFLICT (market_id, slug) DO NOTHING
    `;
  }

  const cmsSource = (cloneCmsFrom as string) || 'atl';
  const sourceRows = await sql`SELECT id FROM markets WHERE slug = ${cmsSource} LIMIT 1`;
  if (sourceRows.length) {
    const sourceId = sourceRows[0].id as string;
    await sql`
      INSERT INTO content_variants (zone_id, market_id, variant_name, content, status, seo_keywords, utm_targets, weight, created_by, updated_by)
      SELECT zone_id, ${marketId}, variant_name,
        REPLACE(content::text, 'Atlanta', ${name as string})::jsonb,
        'draft', seo_keywords, utm_targets, weight, created_by, updated_by
      FROM content_variants WHERE market_id = ${sourceId}
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO personas (slug, label, description, audience, market_id, color, is_active, sort_order)
      SELECT slug, label, description, audience, ${marketId}, color, is_active, sort_order
      FROM personas WHERE market_id = ${sourceId}
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO page_section_layouts (page_slug, funnel_stage_slug, market_id, sections, created_by, updated_by)
      SELECT page_slug, funnel_stage_slug, ${marketId}, sections, created_by, updated_by
      FROM page_section_layouts WHERE market_id = ${sourceId}
      ON CONFLICT DO NOTHING
    `;
  }

  await logAdminAction(admin.id, 'market.create', 'market', marketId, {
    slug, name, areaCount: typedAreas.length,
  });

  return NextResponse.json({ market: inserted[0] }, { status: 201 });
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  // Market scoping: super admins (and admins with NULL admin_market_ids) see
  // all markets; explicitly-scoped admins see only their allowlist. Filter
  // here so the dropdown in the sidebar is automatically constrained, no
  // per-component changes required. The `is_super` is the EFFECTIVE flag,
  // so a super previewing a lower role still sees all markets — market
  // scoping is per-user, not per-role.
  const restricted = !admin.is_super && Array.isArray(admin.admin_market_ids);
  const allowlist = restricted ? admin.admin_market_ids! : null;

  const markets = allowlist === null
    ? await sql`
        SELECT
          m.id, m.slug, m.name, m.subdomain, m.state, m.timezone, m.status,
          m.center_lat, m.center_lng, m.radius_miles,
          m.launch_date, m.sms_did, m.sms_area_code,
          m.fee_config, m.launch_offer_config, m.branding,
          m.min_drivers_to_launch,
          (SELECT COUNT(*) FROM users WHERE market_id = m.id AND profile_type = 'driver')::int as driver_count,
          (SELECT COUNT(*) FROM users WHERE market_id = m.id AND profile_type = 'rider')::int as rider_count,
          (SELECT COUNT(*) FROM rides WHERE market_id = m.id AND status IN ('ended', 'completed'))::int as completed_rides,
          (SELECT COUNT(*) FROM market_areas WHERE market_id = m.id AND is_active = true)::int as area_count
        FROM markets m
        ORDER BY m.status = 'live' DESC, m.name ASC
      `
    : await sql`
        SELECT
          m.id, m.slug, m.name, m.subdomain, m.state, m.timezone, m.status,
          m.center_lat, m.center_lng, m.radius_miles,
          m.launch_date, m.sms_did, m.sms_area_code,
          m.fee_config, m.launch_offer_config, m.branding,
          m.min_drivers_to_launch,
          (SELECT COUNT(*) FROM users WHERE market_id = m.id AND profile_type = 'driver')::int as driver_count,
          (SELECT COUNT(*) FROM users WHERE market_id = m.id AND profile_type = 'rider')::int as rider_count,
          (SELECT COUNT(*) FROM rides WHERE market_id = m.id AND status IN ('ended', 'completed'))::int as completed_rides,
          (SELECT COUNT(*) FROM market_areas WHERE market_id = m.id AND is_active = true)::int as area_count
        FROM markets m
        WHERE m.id = ANY(${allowlist}::UUID[])
        ORDER BY m.status = 'live' DESC, m.name ASC
      `;

  return NextResponse.json({
    markets: markets.map((m: Record<string, unknown>) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      subdomain: m.subdomain,
      state: m.state,
      timezone: m.timezone,
      status: m.status,
      launchDate: m.launch_date,
      smsDid: m.sms_did,
      driverCount: Number(m.driver_count || 0),
      riderCount: Number(m.rider_count || 0),
      completedRides: Number(m.completed_rides || 0),
      areaCount: Number(m.area_count || 0),
      minDriversToLaunch: Number(m.min_drivers_to_launch || 10),
      centerLat: m.center_lat === null || m.center_lat === undefined ? null : Number(m.center_lat),
      centerLng: m.center_lng === null || m.center_lng === undefined ? null : Number(m.center_lng),
    })),
  });
}
