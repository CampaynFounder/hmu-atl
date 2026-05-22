-- 007b_comments_base.sql
-- Creates the base comments table required by 008_comments_v2.sql.
-- Safe to run repeatedly (IF NOT EXISTS throughout).

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

CREATE INDEX IF NOT EXISTS idx_comments_author_id  ON comments(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_subject_id ON comments(subject_id);
CREATE INDEX IF NOT EXISTS idx_comments_ride_id    ON comments(ride_id);
