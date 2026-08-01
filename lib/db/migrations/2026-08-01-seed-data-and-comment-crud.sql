-- 2026-08-01-seed-data-and-comment-crud.sql
-- Additive + idempotent. Ships three things:
--   1. users.is_seed  — marks admin-created demo profiles (drivers/riders). Defaults
--      false so every existing row is unaffected. Seed profiles appear in the browse
--      feeds (they satisfy the existing eligibility WHERE clauses) but are excluded
--      from real dispatch (blast matching + direct booking) in code.
--   2. comments.edited_at — supports user-facing comment edits.
--   3. seed_advertisements — admin-managed promo cards injected into the native feeds.
--
-- Deploy ordering note: the Worker deploys ~40s before migrations run, and the new
-- dispatch guards read users.is_seed. Pre-apply THIS column to prod + staging Neon
-- (Neon MCP) before merging the Worker code so no query hits 42703 during the window.

-- 1. Seed flag on users -------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_seed BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_is_seed ON users(is_seed) WHERE is_seed = true;

-- 2. Comment edits ------------------------------------------------------------
ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 3. Seed advertisements ------------------------------------------------------
CREATE TABLE IF NOT EXISTS seed_advertisements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which browse surface(s) the ad shows on.
  surface     TEXT NOT NULL DEFAULT 'both'
                CHECK (surface IN ('rider_browse', 'driver_browse', 'both')),
  -- NULL market_id = global (all markets); otherwise scoped to one market.
  market_id   UUID REFERENCES markets(id) ON DELETE CASCADE,
  headline    TEXT NOT NULL,
  body        TEXT,
  cta_label   TEXT,
  cta_url     TEXT,
  media_url   TEXT,
  poster_url  TEXT,
  media_type  TEXT CHECK (media_type IN ('photo', 'video')),
  -- Inject one ad card every `frequency` profile cards in the feed.
  frequency   INTEGER NOT NULL DEFAULT 6 CHECK (frequency >= 1),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_seed_ads_active_surface
  ON seed_advertisements(is_active, surface) WHERE is_active = true;
