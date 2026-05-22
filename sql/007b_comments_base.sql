-- 007b_comments_base.sql
-- Ensures the comments table and all base columns exist before 008_comments_v2.sql runs.
-- Fully idempotent: CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
-- handles both fresh DBs (table doesn't exist) and existing DBs missing specific columns.

CREATE TABLE IF NOT EXISTS comments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id           UUID REFERENCES rides(id) ON DELETE SET NULL,
  author_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content           TEXT NOT NULL CHECK (length(content) <= 500),
  is_visible        BOOLEAN NOT NULL DEFAULT true,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill columns that may be missing on DBs where the table already existed
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_visible        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_comments_author_id  ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_subject_id ON comments(subject_id);
CREATE INDEX IF NOT EXISTS idx_comments_ride_id    ON comments(ride_id);
