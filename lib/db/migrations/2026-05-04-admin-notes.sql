-- Admin scratchpad notes for the Marketing SMS page (and future admin tools).
-- One row per saved note. Soft-archive via archived_at — never hard-delete so
-- campaign context survives a misclick. Only the latest non-archived note
-- per admin is rendered as the "current" notepad; everything else is
-- accessible via search.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

-- "Latest active note for this admin" — the dominant query.
CREATE INDEX IF NOT EXISTS idx_admin_notes_admin_active
  ON admin_notes(admin_id, updated_at DESC)
  WHERE archived_at IS NULL;

-- Super-admin view groups by admin so we want a fast scan over all
-- non-archived rows ordered by recency.
CREATE INDEX IF NOT EXISTS idx_admin_notes_active_recent
  ON admin_notes(updated_at DESC)
  WHERE archived_at IS NULL;

-- Trigram index for ILIKE %term% search across body. Volume will stay tiny
-- for the foreseeable future; pg_trgm is fine and a lot simpler than tsvector.
CREATE INDEX IF NOT EXISTS idx_admin_notes_body_trgm
  ON admin_notes USING gin (body gin_trgm_ops);
