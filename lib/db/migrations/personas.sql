-- Personas — targetable audience segments for marketing content

CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  market_id UUID NOT NULL REFERENCES markets(id),
  color TEXT NOT NULL DEFAULT '#448AFF',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slug, market_id)
);

-- Store persona on users for lifetime segmentation
ALTER TABLE users ADD COLUMN IF NOT EXISTS persona TEXT;
