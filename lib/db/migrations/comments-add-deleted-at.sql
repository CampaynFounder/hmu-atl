-- comments-add-deleted-at.sql
-- Adds the deleted_at soft-delete column that the comments API requires.
-- Fully idempotent via ADD COLUMN IF NOT EXISTS.

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_comments_deleted_at
  ON comments(deleted_at)
  WHERE deleted_at IS NULL;
