-- 2026-08-01-seed-comments.sql
-- Additive + idempotent. Lets the admin attach fabricated "seed" comments to a
-- seed driver/rider, each with its own display identity (name, handle, avatar),
-- WITHOUT creating fake author users or weakening any existing column.
--
-- A seed comment is a normal `comments` row where:
--   subject_id = the seed user the comment is about,
--   author_id  = the same seed user (placeholder — satisfies the NOT NULL FK and
--                makes the row cascade-delete when the seed user is deleted),
--   is_seed    = true,
--   seed_author_* = the fabricated commenter identity shown in the UI.
-- The comment-read query COALESCEs seed_author_* over the normal profile join, so
-- real comments (is_seed=false, seed_author_* NULL) are entirely unaffected.
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS is_seed                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seed_author_name       TEXT,
  ADD COLUMN IF NOT EXISTS seed_author_handle     TEXT,
  ADD COLUMN IF NOT EXISTS seed_author_avatar_url TEXT;

-- Fast lookup/cleanup of seed comments.
CREATE INDEX IF NOT EXISTS idx_comments_is_seed ON comments(is_seed) WHERE is_seed = true;
