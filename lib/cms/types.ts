// Funnel CMS — TypeScript types for all CMS entities

export type PageSlug =
  | 'homepage'
  | 'driver_landing'
  | 'rider_landing'
  | 'driver_guide'
  | 'rider_guide'
  | 'compare';

export type Audience = 'driver' | 'rider' | 'all';

export type FunnelStage =
  | 'awareness'
  | 'interest'
  | 'consideration'
  | 'conversion'
  | 'activation'
  | 'evangelism';

export type ZoneType = 'text' | 'rich_text' | 'json' | 'step_list';

export type VariantStatus = 'draft' | 'published' | 'archived' | 'scheduled';

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed';

export interface ZoneConstraints {
  maxChars?: number;
  allowedHtml?: string[];
  jsonSchema?: Record<string, unknown>;
}

// Database row types

export interface ContentZone {
  id: string;
  page_slug: PageSlug;
  zone_key: string;
  audience: Audience;
  funnel_stage: FunnelStage;
  zone_type: ZoneType;
  constraints: ZoneConstraints;
  display_name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface ContentVariant {
  id: string;
  zone_id: string;
  market_id: string;
  variant_name: string;
  content: unknown;
  status: VariantStatus;
  published_at: string | null;
  scheduled_for: string | null;
  seo_keywords: string[] | null;
  utm_targets: Record<string, string[]> | null;
  weight: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentVersion {
  id: string;
  variant_id: string;
  version_number: number;
  content: unknown;
  status: string;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ContentFeatureFlag {
  id: string;
  flag_key: string;
  market_id: string;
  audience: Audience;
  enabled: boolean;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export interface ContentExperiment {
  id: string;
  name: string;
  zone_id: string;
  market_id: string;
  status: ExperimentStatus;
  variant_ids: string[];
  goal_event: string;
  goal_metric: string;
  started_at: string | null;
  ended_at: string | null;
  winner_variant_id: string | null;
  sample_size_target: number;
  created_by: string | null;
  created_at: string;
}

export interface ContentABAssignment {
  id: string;
  experiment_id: string;
  visitor_id: string;
  variant_id: string;
  assigned_at: string;
}

// Zone registry entry (used for seeding + defaults)

export interface ZoneRegistryEntry {
  pageSlug: PageSlug;
  zoneKey: string;
  audience: Audience;
  funnelStage: FunnelStage;
  zoneType: ZoneType;
  constraints: ZoneConstraints;
  displayName: string;
  description: string;
  sortOrder: number;
  defaultContent: unknown;
}

// Content map returned by queries (zone_key → content)

export type ContentMap = Record<string, unknown>;

// Flag map returned by queries (flag_key → enabled)

export type FlagMap = Record<string, boolean>;

// Page content response from the API

export interface PageContentResponse {
  content: ContentMap;
  flags: FlagMap;
  experiments: Record<string, { experimentId: string; variantId: string; variantName: string }>;
  sectionOrder: string[];
  funnelStage: string;
}

// Funnel stage DB row

export interface FunnelStageRow {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  color: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

// Section layout entry (stored as JSONB array in page_section_layouts)

export interface SectionLayoutEntry {
  sectionKey: string;
  visible: boolean;
}
