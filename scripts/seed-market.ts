/**
 * Seed a new market from a declarative JSON config.
 *
 * Usage:
 *   npx tsx scripts/seed-market.ts --config markets/nola.json
 *   npx tsx scripts/seed-market.ts --config markets/chi.json --dry-run
 *
 * What it does:
 *   1. INSERT/UPSERT the markets row (idempotent via slug).
 *   2. Insert market_areas for each area in the config + the 5 cardinal macro
 *      rows (westside/eastside/…) so "anywhere on the X" is pickable too.
 *   3. If `clone_cms_from` is set, clone that market's content_variants,
 *      personas, and page_section_layouts into the new market. Variants are
 *      inserted as status='draft' (admin must review + publish).
 *
 * No schema changes. Fully idempotent — safe to re-run. ATL data is never
 * touched; only reads from the clone source.
 *
 * Operational sequence for a new market:
 *   1. Fill out markets/<slug>.json
 *   2. npx tsx scripts/seed-market.ts --config markets/<slug>.json
 *   3. Add <slug>.hmucashride.com route to wrangler.worker.jsonc + deploy
 *   4. Add DNS record + Clerk satellite config
 *   5. Flip status via /admin/markets once ready
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';

interface AreaConfig {
  slug: string;
  name: string;
  cardinal: 'westside' | 'eastside' | 'northside' | 'southside' | 'central';
  sort_order: number;
}

interface MarketConfig {
  slug: string;
  name: string;
  subdomain: string;
  state: string;
  timezone: string;
  status?: string;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
  sms_did?: string;
  sms_area_code?: string;
  min_drivers_to_launch?: number;
  branding?: Record<string, unknown>;
  clone_cms_from?: string;
  areas: AreaConfig[];
}

function parseArgs(): { config: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  let config = '';
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) { config = args[i + 1]; i++; }
    else if (args[i] === '--dry-run') dryRun = true;
  }
  if (!config) {
    console.error('Usage: npx tsx scripts/seed-market.ts --config <path-to-market.json> [--dry-run]');
    process.exit(1);
  }
  return { config, dryRun };
}

async function main() {
  const { config: configPath, dryRun } = parseArgs();
  const cfg: MarketConfig = JSON.parse(readFileSync(configPath, 'utf-8'));

  console.log(`Seeding market: ${cfg.slug} (${cfg.name})`);
  console.log(`  subdomain:  ${cfg.subdomain}.hmucashride.com`);
  console.log(`  timezone:   ${cfg.timezone}`);
  console.log(`  center:     (${cfg.center_lat}, ${cfg.center_lng}) r=${cfg.radius_miles}mi`);
  console.log(`  areas:      ${cfg.areas.length} (+ 5 cardinal macros)`);
  console.log(`  clone cms:  ${cfg.clone_cms_from || '(none)'}`);
  console.log(`  dry run:    ${dryRun}`);

  if (dryRun) {
    console.log('\nDry run — no DB writes. Exiting.');
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const sql = neon(dbUrl);

  // 1. Upsert market row
  const inserted = await sql`
    INSERT INTO markets (
      slug, name, subdomain, state, timezone, status,
      center_lat, center_lng, radius_miles,
      sms_did, sms_area_code, min_drivers_to_launch,
      fee_config, launch_offer_config, branding
    ) VALUES (
      ${cfg.slug}, ${cfg.name}, ${cfg.subdomain}, ${cfg.state}, ${cfg.timezone},
      ${cfg.status || 'setup'},
      ${cfg.center_lat}, ${cfg.center_lng}, ${cfg.radius_miles},
      ${cfg.sms_did ?? null}, ${cfg.sms_area_code ?? null},
      ${cfg.min_drivers_to_launch ?? 5},
      '{}'::jsonb, '{}'::jsonb,
      ${JSON.stringify(cfg.branding || {})}::jsonb
    )
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name, subdomain = EXCLUDED.subdomain,
      timezone = EXCLUDED.timezone,
      center_lat = EXCLUDED.center_lat, center_lng = EXCLUDED.center_lng,
      radius_miles = EXCLUDED.radius_miles,
      updated_at = NOW()
    RETURNING id
  `;
  const marketId = inserted[0]?.id as string;
  console.log(`✓ Market row: ${marketId}`);

  // 2. Areas (specifics + cardinal macros)
  const CARDINAL_MACROS: AreaConfig[] = [
    { slug: 'central',   name: 'Central',   cardinal: 'central',   sort_order: 100 },
    { slug: 'eastside',  name: 'Eastside',  cardinal: 'eastside',  sort_order: 101 },
    { slug: 'westside',  name: 'Westside',  cardinal: 'westside',  sort_order: 102 },
    { slug: 'northside', name: 'Northside', cardinal: 'northside', sort_order: 103 },
    { slug: 'southside', name: 'Southside', cardinal: 'southside', sort_order: 104 },
  ];
  const allAreas = [...cfg.areas, ...CARDINAL_MACROS];

  for (const area of allAreas) {
    await sql`
      INSERT INTO market_areas (market_id, slug, name, cardinal, sort_order, is_active)
      VALUES (${marketId}, ${area.slug}, ${area.name}, ${area.cardinal}, ${area.sort_order}, true)
      ON CONFLICT (market_id, slug) DO NOTHING
    `;
  }
  console.log(`✓ Areas: ${allAreas.length} (${cfg.areas.length} specifics + 5 macros)`);

  // 3. Clone CMS content from another market, if requested
  if (cfg.clone_cms_from) {
    const source = await sql`SELECT id FROM markets WHERE slug = ${cfg.clone_cms_from} LIMIT 1`;
    if (source.length === 0) {
      console.warn(`  ⚠ clone_cms_from='${cfg.clone_cms_from}' not found — skipping CMS clone`);
    } else {
      const sourceId = source[0].id as string;
      const upperCity = cfg.name.toUpperCase();

      await sql`
        INSERT INTO content_variants (
          zone_id, market_id, variant_name, content, status,
          seo_keywords, utm_targets, weight, created_by, updated_by
        )
        SELECT zone_id, ${marketId}, variant_name,
          REPLACE(content::text, 'Atlanta', ${cfg.name})::jsonb,
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

      console.log(`✓ CMS cloned from '${cfg.clone_cms_from}' (variants as drafts — review in /admin/funnel)`);
      console.log(`  Note: only 'Atlanta' → '${cfg.name}' is auto-swapped. City-short-codes (ATL, N.O.)`);
      console.log(`  need manual review in the admin. Upper-case city name for convenience: ${upperCity}`);
    }
  }

  console.log(`\n✅ Market '${cfg.slug}' seeded. Next steps:`);
  console.log(`  1. Add ${cfg.subdomain}.hmucashride.com route to wrangler.worker.jsonc`);
  console.log(`  2. CNAME ${cfg.subdomain}.hmucashride.com → worker (Cloudflare DNS)`);
  console.log(`  3. Review/publish CMS drafts in /admin/funnel for market='${cfg.slug}'`);
  console.log(`  4. Flip status to 'soft_launch' or 'live' via /admin/markets when ready`);
}

main().catch((err) => {
  console.error('seed-market failed:', err);
  process.exit(1);
});
