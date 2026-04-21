// Funnel CMS — Server-side queries for content loading

import { sql } from '@/lib/db/client';
import { getDefaultContentMap } from './zone-registry';
import { getDefaultSectionOrder } from './section-registry';
import { resolveTierCardExtras } from './tier-card-resolver';
import type { ContentMap, FlagMap, PageContentResponse, SectionLayoutEntry } from './types';

/**
 * Load all published content for a page + market.
 * Supports utm_funnel for stage-specific content variants and section ordering.
 * Falls back to zone registry defaults for any missing zones.
 */
export async function getPageContent(
  pageSlug: string,
  marketSlug: string = 'atl',
  utmParams?: { utm_source?: string; utm_campaign?: string; utm_funnel?: string; utm_persona?: string },
  visitorId?: string,
): Promise<PageContentResponse> {
  const defaults = getDefaultContentMap(pageSlug);
  const defaultOrder = getDefaultSectionOrder(pageSlug);
  const funnelStage = utmParams?.utm_funnel || 'awareness';

  try {
    // Load published variants for this page + market
    const variants = await sql`
      SELECT
        cz.zone_key,
        cv.id as variant_id,
        cv.variant_name,
        cv.content,
        cv.utm_targets
      FROM content_zones cz
      JOIN content_variants cv ON cv.zone_id = cz.id
      JOIN markets m ON m.id = cv.market_id
      WHERE cz.page_slug = ${pageSlug}
        AND m.slug = ${marketSlug}
        AND cv.status = 'published'
      ORDER BY cz.sort_order ASC, cv.weight DESC
    `;

    // Build content map: prefer UTM-targeted variants, then control
    const content: ContentMap = { ...defaults };
    const zoneVariants: Record<string, Array<{ content: unknown; utm_targets: Record<string, string[]> | null; variant_name: string }>> = {};

    for (const row of variants) {
      const key = row.zone_key as string;
      if (!zoneVariants[key]) zoneVariants[key] = [];
      zoneVariants[key].push({
        content: row.content,
        utm_targets: row.utm_targets as Record<string, string[]> | null,
        variant_name: row.variant_name as string,
      });
    }

    // Load active persona slugs to validate utm_persona targeting
    let activePersonaSlugs: Set<string> | null = null;
    if (utmParams?.utm_persona) {
      try {
        const personaRows = await sql`SELECT slug FROM personas WHERE is_active = true`;
        activePersonaSlugs = new Set(personaRows.map((r: Record<string, unknown>) => r.slug as string));
      } catch { activePersonaSlugs = null; }
    }
    const isPersonaActive = (slug: string) => !activePersonaSlugs || activePersonaSlugs.has(slug);

    for (const [key, variantList] of Object.entries(zoneVariants)) {
      // Check for UTM-targeted variant first (including utm_funnel)
      if (utmParams) {
        const utmMatch = variantList.find((v) => {
          if (!v.utm_targets) return false;
          const { utm_source, utm_campaign, utm_funnel, utm_persona } = utmParams;
          if (utm_persona && isPersonaActive(utm_persona) && v.utm_targets.utm_persona?.includes(utm_persona)) return true;
          if (utm_funnel && v.utm_targets.utm_funnel?.includes(utm_funnel)) return true;
          if (utm_source && v.utm_targets.utm_source?.includes(utm_source)) return true;
          if (utm_campaign && v.utm_targets.utm_campaign?.includes(utm_campaign)) return true;
          return false;
        });
        if (utmMatch) {
          content[key] = utmMatch.content;
          continue;
        }
      }
      // Fall back to control variant or first published
      const control = variantList.find((v) => v.variant_name === 'control') || variantList[0];
      if (control) content[key] = control.content;
    }

    // Load section layout for this page + stage
    let sectionOrder = defaultOrder;
    try {
      const layoutRows = await sql`
        SELECT sections FROM page_section_layouts
        WHERE page_slug = ${pageSlug}
          AND funnel_stage_slug = ${funnelStage}
          AND market_id = (SELECT id FROM markets WHERE slug = ${marketSlug} LIMIT 1)
        LIMIT 1
      `;
      if (layoutRows.length > 0 && Array.isArray(layoutRows[0].sections)) {
        const entries = layoutRows[0].sections as SectionLayoutEntry[];
        sectionOrder = entries.filter((e) => e.visible).map((e) => e.sectionKey);
      }
    } catch {
      // Fall back to default order
    }

    // Load feature flags
    const flagRows = await sql`
      SELECT cff.flag_key, cff.enabled
      FROM content_feature_flags cff
      JOIN markets m ON m.id = cff.market_id
      WHERE m.slug = ${marketSlug}
    `;
    const flags: FlagMap = {};
    for (const row of flagRows) {
      flags[row.flag_key as string] = row.enabled as boolean;
    }

    // Load experiment assignments (if visitor ID provided)
    const experiments: PageContentResponse['experiments'] = {};
    if (visitorId) {
      const assignmentRows = await sql`
        SELECT
          ce.id as experiment_id,
          cz.zone_key,
          ca.variant_id,
          cv.variant_name
        FROM content_experiments ce
        JOIN content_zones cz ON cz.id = ce.zone_id
        JOIN content_ab_assignments ca ON ca.experiment_id = ce.id
        JOIN content_variants cv ON cv.id = ca.variant_id
        JOIN markets m ON m.id = ce.market_id
        WHERE ce.status = 'running'
          AND cz.page_slug = ${pageSlug}
          AND m.slug = ${marketSlug}
          AND ca.visitor_id = ${visitorId}
      `;
      for (const row of assignmentRows) {
        const key = row.zone_key as string;
        experiments[key] = {
          experimentId: row.experiment_id as string,
          variantId: row.variant_id as string,
          variantName: row.variant_name as string,
        };
        const expVariant = variants.find(
          (v: Record<string, unknown>) => v.variant_id === row.variant_id
        );
        if (expVariant) {
          content[key] = expVariant.content;
        }
      }
    }

    // Enrich tier_* zones with strikethrough / offer-label fields from
    // active public_offers. Never throws; falls back to current content.
    const enrichedContent = await resolveTierCardExtras(content, marketSlug, funnelStage);

    return { content: enrichedContent, flags, experiments, sectionOrder, funnelStage };
  } catch (error) {
    console.error('[CMS] Failed to load content, using defaults:', error);
    return { content: defaults, flags: {}, experiments: {}, sectionOrder: defaultOrder, funnelStage };
  }
}
