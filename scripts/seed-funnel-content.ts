/**
 * Seed Funnel CMS — registers zones and creates control variants from the zone registry.
 *
 * Usage:
 *   npx tsx scripts/seed-funnel-content.ts
 *
 * Requires DATABASE_URL env var set (e.g. via .env.local)
 */

import { neon } from '@neondatabase/serverless';
import { ZONE_REGISTRY } from '../lib/cms/zone-registry';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = neon(dbUrl);

  // Get ATL market ID
  const markets = await sql`SELECT id, slug FROM markets WHERE slug = 'atl' LIMIT 1`;
  if (markets.length === 0) {
    console.error('No ATL market found in markets table. Create it first.');
    process.exit(1);
  }
  const atlMarketId = markets[0].id as string;
  console.log(`ATL market ID: ${atlMarketId}`);

  let zonesCreated = 0;
  let variantsCreated = 0;
  let zonesSkipped = 0;

  for (const entry of ZONE_REGISTRY) {
    // Upsert zone
    const existingZone = await sql`
      SELECT id FROM content_zones
      WHERE page_slug = ${entry.pageSlug} AND zone_key = ${entry.zoneKey}
    `;

    let zoneId: string;
    if (existingZone.length > 0) {
      zoneId = existingZone[0].id as string;
      zonesSkipped++;
    } else {
      const rows = await sql`
        INSERT INTO content_zones (page_slug, zone_key, audience, funnel_stage, zone_type, constraints, display_name, description, sort_order)
        VALUES (
          ${entry.pageSlug}, ${entry.zoneKey}, ${entry.audience}, ${entry.funnelStage},
          ${entry.zoneType}, ${JSON.stringify(entry.constraints)}, ${entry.displayName},
          ${entry.description}, ${entry.sortOrder}
        )
        RETURNING id
      `;
      zoneId = rows[0].id as string;
      zonesCreated++;
    }

    // Create control variant if not exists
    const existingVariant = await sql`
      SELECT id FROM content_variants
      WHERE zone_id = ${zoneId} AND market_id = ${atlMarketId} AND variant_name = 'control'
    `;

    if (existingVariant.length === 0) {
      const variantRows = await sql`
        INSERT INTO content_variants (zone_id, market_id, variant_name, content, status, published_at)
        VALUES (${zoneId}, ${atlMarketId}, 'control', ${JSON.stringify(entry.defaultContent)}, 'published', NOW())
        RETURNING id
      `;

      // Create initial version
      await sql`
        INSERT INTO content_versions (variant_id, version_number, content, status, change_summary)
        VALUES (${variantRows[0].id}, 1, ${JSON.stringify(entry.defaultContent)}, 'published', 'Initial seed from zone registry')
      `;

      variantsCreated++;
    }
  }

  console.log(`\nSeed complete:`);
  console.log(`  Zones created: ${zonesCreated}`);
  console.log(`  Zones skipped (existing): ${zonesSkipped}`);
  console.log(`  Variants created: ${variantsCreated}`);
  console.log(`  Total registry entries: ${ZONE_REGISTRY.length}`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
