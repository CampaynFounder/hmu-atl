-- 008_comments_v2.sql
-- Extends the existing `comments` table with replies, reactions, and admin moderation.
-- Adds `comment_reactions` for per-user deduplication.

-- 1. Extend comments table
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS redacted_content TEXT,
  ADD COLUMN IF NOT EXISTS redacted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS redacted_at TIMESTAMPTZ;

-- Index for fetching replies efficiently
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);
-- Index for fetching all comments about a subject
CREATE INDEX IF NOT EXISTS idx_comments_subject_id ON comments(subject_id);
-- Index for admin moderation queue (flagged + not yet reviewed)
CREATE INDEX IF NOT EXISTS idx_comments_flagged ON comments(flagged_for_review) WHERE flagged_for_review = true;

-- 2. Per-user reactions to comments
CREATE TABLE IF NOT EXISTS comment_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction    TEXT NOT NULL CHECK (reaction IN ('like', 'heart', 'haha', 'dislike')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id);
