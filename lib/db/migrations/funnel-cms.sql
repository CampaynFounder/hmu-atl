-- Funnel CMS — Dynamic marketing content management
-- Run against Neon production database

-- 1. content_zones: Registry of every editable slot on marketing pages
CREATE TABLE IF NOT EXISTS content_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug TEXT NOT NULL,
  zone_key TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  funnel_stage TEXT NOT NULL DEFAULT 'awareness',
  zone_type TEXT NOT NULL DEFAULT 'text',
  constraints JSONB NOT NULL DEFAULT '{}',
  display_name TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_slug, zone_key)
);

CREATE INDEX IF NOT EXISTS idx_content_zones_page ON content_zones(page_slug);

-- 2. content_variants: Actual content scoped to market, supports A/B testing
CREATE TABLE IF NOT EXISTS content_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES content_zones(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL DEFAULT 'control',
  content JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  seo_keywords TEXT[],
  utm_targets JSONB,
  weight INT DEFAULT 100,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zone_id, market_id, variant_name)
);

CREATE INDEX IF NOT EXISTS idx_content_variants_zone ON content_variants(zone_id);
CREATE INDEX IF NOT EXISTS idx_content_variants_market ON content_variants(market_id);
CREATE INDEX IF NOT EXISTS idx_content_variants_status ON content_variants(status);

-- 3. content_versions: Every save creates a version for rollback
CREATE TABLE IF NOT EXISTS content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES content_variants(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content JSONB NOT NULL,
  status TEXT NOT NULL,
  change_summary TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_versions_variant ON content_versions(variant_id);

-- 4. content_feature_flags: Toggle sections on/off per market
CREATE TABLE IF NOT EXISTS content_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL,
  market_id UUID NOT NULL REFERENCES markets(id),
  audience TEXT NOT NULL DEFAULT 'all',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(flag_key, market_id, audience)
);

CREATE INDEX IF NOT EXISTS idx_content_flags_key ON content_feature_flags(flag_key);

-- 5. content_experiments: A/B test definitions
CREATE TABLE IF NOT EXISTS content_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  zone_id UUID NOT NULL REFERENCES content_zones(id),
  market_id UUID NOT NULL REFERENCES markets(id),
  status TEXT NOT NULL DEFAULT 'draft',
  variant_ids UUID[] NOT NULL,
  goal_event TEXT NOT NULL,
  goal_metric TEXT DEFAULT 'conversion_rate',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  winner_variant_id UUID,
  sample_size_target INT DEFAULT 1000,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_experiments_zone ON content_experiments(zone_id);
CREATE INDEX IF NOT EXISTS idx_content_experiments_status ON content_experiments(status);

-- 6. content_ab_assignments: Sticky visitor → variant assignments
CREATE TABLE IF NOT EXISTS content_ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES content_experiments(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  variant_id UUID NOT NULL REFERENCES content_variants(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(experiment_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_content_ab_visitor ON content_ab_assignments(experiment_id, visitor_id);
