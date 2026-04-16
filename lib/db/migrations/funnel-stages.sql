-- Funnel Stages — stage-specific marketing content + section ordering
-- Run against Neon production database

-- 1. funnel_stages: dynamic stage definitions (admin can add more)
CREATE TABLE IF NOT EXISTS funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#448AFF',
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. page_section_layouts: section ordering per page × stage × market
CREATE TABLE IF NOT EXISTS page_section_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug TEXT NOT NULL,
  funnel_stage_slug TEXT NOT NULL REFERENCES funnel_stages(slug),
  market_id UUID NOT NULL REFERENCES markets(id),
  sections JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_slug, funnel_stage_slug, market_id)
);
